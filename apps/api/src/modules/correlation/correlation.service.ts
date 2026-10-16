import type {
  CorrelationResult,
  IncidentLink,
  LinkIncidentInput,
  RerunCorrelationInput,
  SuggestionDecisionInput,
} from '@traceback/shared';
import { CORRELATION_ALGORITHM_VERSION } from '@traceback/shared';
import type { Database, DbExecutor } from '../../db/client';
import type { ChangeRow, DeploymentRow, IncidentLinkRow, IncidentRow } from '../../db/schema';
import { AppError } from '../../lib/errors';
import type { AuditContext } from '../audit/audit.service';
import { writeAudit } from '../audit/audit.service';
import { createChangesRepository } from '../changes/changes.repository';
import { createDeploymentsRepository } from '../deployments/deployments.repository';
import type { EventsService } from '../events/events.service';
import { createIncidentsRepository } from '../incidents/incidents.repository';
import { createCorrelationRepository, type CorrelationRepository } from './correlation.repository';
import {
  buildCorrelationResult,
  rankCandidates,
  type CandidateFacts,
  type IncidentFacts,
} from './scoring';

/** The incident row, reduced to exactly what the scoring engine needs. */
export function toIncidentFacts(row: IncidentRow): IncidentFacts {
  return {
    id: row.id,
    service: row.service,
    environment: row.environment,
    affectedComponents: row.affectedComponents,
    fingerprint: row.fingerprint,
    startedAt: row.startedAt,
  };
}

/**
 * A deployment is scored on its own metadata plus the file list of the changes it
 * contains (a deployment rarely lists files itself). Anything not yet known — an
 * incomplete deployment — degrades gracefully: a null status simply contributes no
 * status signal instead of pinning the score to zero.
 */
export function deploymentToCandidate(row: DeploymentRow, files: string[] = []): CandidateFacts {
  return {
    entityType: 'deployment',
    entityId: row.id,
    happenedAt: row.finishedAt ?? row.startedAt ?? row.createdAt,
    service: row.service,
    environment: row.environment,
    status: row.status,
    authorEmail: row.authorEmail,
    files,
    services: [row.service],
  };
}

export function changeToCandidate(row: ChangeRow): CandidateFacts {
  return {
    entityType: 'change',
    entityId: row.id,
    happenedAt: row.createdAt,
    service: row.services[0] ?? null,
    environment: null,
    status: null,
    authorEmail: row.authorEmail,
    files: row.filesChanged,
    services: row.services,
  };
}

export function toIncidentLinkDto(row: IncidentLinkRow): IncidentLink {
  return {
    id: row.id,
    incidentId: row.incidentId,
    entityType: row.entityType,
    entityId: row.entityId,
    source: row.source,
    status: row.status,
    score: row.score === null ? null : Number(row.score),
    reasons: row.reasons,
    algorithmVersion: row.algorithmVersion,
    note: row.note,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
  };
}

export type SuggestionAction = 'insert' | 'refresh' | 'keep';

/**
 * What a re-run should do with an entity that may already have a link. Pure and
 * exported because the "never clobber a human decision" rule is worth a test: a
 * confirmed/rejected link, or a hand-made one, is left alone.
 */
export function planSuggestionWrite(
  existing: Pick<IncidentLinkRow, 'source' | 'status'> | undefined,
): SuggestionAction {
  if (!existing) return 'insert';
  return existing.source === 'suggested' && existing.status === 'suggested' ? 'refresh' : 'keep';
}

/** Rebuild the client-facing envelope from stored rows (used by the read path). */
export function toStoredCorrelationResult(
  incidentId: string,
  rows: IncidentLinkRow[],
  generatedAt: Date = new Date(),
): CorrelationResult {
  return {
    algorithmVersion: rows[0]?.algorithmVersion ?? CORRELATION_ALGORITHM_VERSION,
    incidentId,
    candidates: rows.map((row) => ({
      entityType: row.entityType,
      entityId: row.entityId,
      score: row.score === null ? 0 : Number(row.score),
      reasons: row.reasons,
      signals: row.signals,
    })),
    generatedAt: generatedAt.toISOString(),
  };
}

async function assertEntityInProject(
  executor: DbExecutor,
  projectId: string,
  entityType: IncidentLink['entityType'],
  entityId: string,
): Promise<void> {
  const found =
    entityType === 'deployment'
      ? await createDeploymentsRepository(executor).findById(projectId, entityId)
      : await createChangesRepository(executor).findById(projectId, entityId);

  if (!found) {
    throw AppError.notFound(entityType === 'deployment' ? 'Deployment' : 'Change', entityId);
  }
}

export interface CorrelationService {
  /** Recompute, persist and rank suggestions for an incident. */
  run(
    projectId: string,
    incidentId: string,
    input: RerunCorrelationInput,
    actorId: string | null,
    context?: AuditContext,
  ): Promise<CorrelationResult>;
  /** Read back the currently-suggested (undecided) entities for an incident. */
  getSuggestions(projectId: string, incidentId: string): Promise<CorrelationResult>;
  /** Every link for an incident, decided or not. */
  listLinks(projectId: string, incidentId: string): Promise<IncidentLink[]>;
  /** A human explicitly links a deployment/change to an incident. */
  addManualLink(
    projectId: string,
    incidentId: string,
    input: LinkIncidentInput,
    actorId: string | null,
    context?: AuditContext,
  ): Promise<IncidentLink>;
  /** Confirm or reject an engine suggestion; the verdict becomes a future signal. */
  decide(
    projectId: string,
    incidentId: string,
    linkId: string,
    input: SuggestionDecisionInput,
    actorId: string | null,
    context?: AuditContext,
  ): Promise<IncidentLink>;
}

export function createCorrelationService(db: Database, events: EventsService): CorrelationService {
  const repo: CorrelationRepository = createCorrelationRepository(db);

  async function requireIncident(
    executor: DbExecutor,
    projectId: string,
    incidentId: string,
  ): Promise<IncidentRow> {
    const incident = await createIncidentsRepository(executor).findById(projectId, incidentId);
    if (!incident) throw AppError.notFound('Incident', incidentId);
    return incident;
  }

  return {
    async run(projectId, incidentId, input, actorId, context) {
      return db.transaction(async (tx) => {
        const incident = await requireIncident(tx, projectId, incidentId);
        const txRepo = createCorrelationRepository(tx);

        const to = new Date();
        const from = new Date(to.getTime() - input.lookbackHours * 3_600_000);

        const [deployments, changes] = await Promise.all([
          createDeploymentsRepository(tx).listInWindow(projectId, from, to),
          createChangesRepository(tx).listInWindow(projectId, from, to),
        ]);

        // A deployment's file overlap comes from the changes it bundles.
        const filesByDeployment = new Map<string, string[]>();
        for (const change of changes) {
          if (!change.deploymentId) continue;
          const list = filesByDeployment.get(change.deploymentId) ?? [];
          list.push(...change.filesChanged);
          filesByDeployment.set(change.deploymentId, list);
        }

        const candidates: CandidateFacts[] = [
          ...deployments.map((row) =>
            deploymentToCandidate(row, filesByDeployment.get(row.id) ?? []),
          ),
          ...changes.map(changeToCandidate),
        ];

        const incidentFacts = toIncidentFacts(incident);
        const fingerprintHistory = await txRepo.countRecurringIncidents(
          projectId,
          incident.fingerprint,
          incidentId,
        );

        // Author history is per person, computed once per distinct author.
        const authors = [
          ...new Set(
            candidates
              .map((candidate) => candidate.authorEmail)
              .filter((email): email is string => Boolean(email)),
          ),
        ];
        const authorHistory = new Map<string, number>();
        for (const author of authors) {
          authorHistory.set(
            author,
            await txRepo.countAuthorHistory(projectId, incident.fingerprint, author, incidentId),
          );
        }

        const ranked = rankCandidates(incidentFacts, candidates, {
          minScore: input.minScore,
          limit: input.limit,
          fingerprintHistory,
          contextFor: (candidate) => ({
            authorHistory: candidate.authorEmail
              ? (authorHistory.get(candidate.authorEmail) ?? 0)
              : 0,
          }),
        });

        for (const scored of ranked) {
          const existing = await txRepo.findLinkByEntity(
            incidentId,
            scored.entityType,
            scored.entityId,
          );
          const action = planSuggestionWrite(existing);

          if (action === 'insert') {
            await txRepo.insertLink({
              incidentId,
              entityType: scored.entityType,
              entityId: scored.entityId,
              source: 'suggested',
              status: 'suggested',
              score: scored.score.toFixed(4),
              reasons: scored.reasons,
              signals: scored.signals,
              algorithmVersion: CORRELATION_ALGORITHM_VERSION,
              createdBy: actorId,
            });
          } else if (action === 'refresh') {
            await txRepo.refreshSuggestion({
              incidentId,
              entityType: scored.entityType,
              entityId: scored.entityId,
              score: scored.score,
              reasons: scored.reasons,
              signals: scored.signals,
              algorithmVersion: CORRELATION_ALGORITHM_VERSION,
            });
          }
        }

        await events.append(
          {
            projectId,
            type: 'correlation.suggested',
            entityType: 'incident',
            entityId: incidentId,
            actorId,
            payload: {
              algorithmVersion: CORRELATION_ALGORITHM_VERSION,
              lookbackHours: input.lookbackHours,
              minScore: input.minScore,
              fingerprintHistory,
              count: ranked.length,
              candidates: ranked.map(({ entityType, entityId, score }) => ({
                entityType,
                entityId,
                score,
              })),
            },
          },
          tx,
        );

        await writeAudit(tx, {
          projectId,
          actorId,
          action: 'update',
          entityType: 'incident',
          entityId: incidentId,
          after: {
            correlation: {
              algorithmVersion: CORRELATION_ALGORITHM_VERSION,
              suggested: ranked.length,
            },
          },
          ip: context?.ip,
          userAgent: context?.userAgent,
        });

        return buildCorrelationResult(incidentId, ranked);
      });
    },

    async getSuggestions(projectId, incidentId) {
      await requireIncident(db, projectId, incidentId);
      const rows = (await repo.listLinks(incidentId)).filter((row) => row.status === 'suggested');
      return toStoredCorrelationResult(incidentId, rows);
    },

    async listLinks(projectId, incidentId) {
      await requireIncident(db, projectId, incidentId);
      const rows = await repo.listLinks(incidentId);
      return rows.map(toIncidentLinkDto);
    },

    async addManualLink(projectId, incidentId, input, actorId, context) {
      return db.transaction(async (tx) => {
        const incident = await requireIncident(tx, projectId, incidentId);
        await assertEntityInProject(tx, projectId, input.entityType, input.entityId);

        const txRepo = createCorrelationRepository(tx);
        const existing = await txRepo.findLinkByEntity(
          incidentId,
          input.entityType,
          input.entityId,
        );

        // Linking an entity the engine already suggested promotes that row to a
        // confirmed manual link rather than creating a duplicate.
        const link =
          existing !== undefined
            ? ((await txRepo.setLinkStatus(incidentId, existing.id, {
                status: 'confirmed',
                note: input.note ?? existing.note,
              })) ?? existing)
            : await txRepo.insertLink({
                incidentId,
                entityType: input.entityType,
                entityId: input.entityId,
                source: 'manual',
                status: 'confirmed',
                score: null,
                reasons: [],
                signals: {},
                note: input.note ?? null,
                createdBy: actorId,
              });

        await events.append(
          {
            projectId,
            type: 'incident.link_added',
            entityType: 'incident_link',
            entityId: link.id,
            actorId,
            payload: {
              incidentId: incident.id,
              entityType: link.entityType,
              entityId: link.entityId,
              source: link.source,
              note: link.note,
            },
          },
          tx,
        );

        await writeAudit(tx, {
          projectId,
          actorId,
          action: 'link',
          entityType: 'incident_link',
          entityId: link.id,
          after: { incidentId, entityType: link.entityType, entityId: link.entityId },
          ip: context?.ip,
          userAgent: context?.userAgent,
        });

        return toIncidentLinkDto(link);
      });
    },

    async decide(projectId, incidentId, linkId, input, actorId, context) {
      return db.transaction(async (tx) => {
        await requireIncident(tx, projectId, incidentId);
        const txRepo = createCorrelationRepository(tx);

        const existing = await txRepo.findLink(incidentId, linkId);
        if (!existing) throw AppError.notFound('Incident link', linkId);
        if (existing.source !== 'suggested') {
          throw AppError.conflict('Only engine suggestions can be confirmed or rejected', {
            linkId,
          });
        }

        const status = input.decision === 'confirm' ? 'confirmed' : 'rejected';
        const link = await txRepo.setLinkStatus(incidentId, linkId, {
          status,
          note: input.note ?? existing.note,
        });
        if (!link) throw AppError.notFound('Incident link', linkId);

        await events.append(
          {
            projectId,
            type: status === 'confirmed' ? 'incident.link_confirmed' : 'incident.link_rejected',
            entityType: 'incident_link',
            entityId: linkId,
            actorId,
            payload: {
              incidentId,
              entityType: link.entityType,
              entityId: link.entityId,
              score: link.score === null ? null : Number(link.score),
              note: link.note,
            },
          },
          tx,
        );

        await writeAudit(tx, {
          projectId,
          actorId,
          action: 'link',
          entityType: 'incident_link',
          entityId: linkId,
          before: { status: existing.status },
          after: { status: link.status },
          ip: context?.ip,
          userAgent: context?.userAgent,
        });

        return toIncidentLinkDto(link);
      });
    },
  };
}
