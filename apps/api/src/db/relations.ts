import { relations } from "drizzle-orm";
import {
  users,
  comparisonSessions,
  referenceVersions,
  documents,
  comparisonJobs,
  comparisonItems,
  jobEvents,
} from "./schema";

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(comparisonSessions),
}));

export const comparisonSessionsRelations = relations(
  comparisonSessions,
  ({ one, many }) => ({
    user: one(users, {
      fields: [comparisonSessions.userId],
      references: [users.id],
    }),
    referenceVersions: many(referenceVersions),
    documents: many(documents),
    jobs: many(comparisonJobs),
  })
);

export const referenceVersionsRelations = relations(
  referenceVersions,
  ({ one }) => ({
    session: one(comparisonSessions, {
      fields: [referenceVersions.sessionId],
      references: [comparisonSessions.id],
    }),
  })
);

export const documentsRelations = relations(documents, ({ one }) => ({
  session: one(comparisonSessions, {
    fields: [documents.sessionId],
    references: [comparisonSessions.id],
  }),
}));

export const comparisonJobsRelations = relations(
  comparisonJobs,
  ({ one, many }) => ({
    session: one(comparisonSessions, {
      fields: [comparisonJobs.sessionId],
      references: [comparisonSessions.id],
    }),
    items: many(comparisonItems),
    events: many(jobEvents),
  })
);

export const comparisonItemsRelations = relations(comparisonItems, ({ one }) => ({
  job: one(comparisonJobs, {
    fields: [comparisonItems.jobId],
    references: [comparisonJobs.id],
  }),
  document: one(documents, {
    fields: [comparisonItems.documentId],
    references: [documents.id],
  }),
}));

export const jobEventsRelations = relations(jobEvents, ({ one }) => ({
  job: one(comparisonJobs, {
    fields: [jobEvents.jobId],
    references: [comparisonJobs.id],
  }),
}));
