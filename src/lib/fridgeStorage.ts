/**
 * One thing in the fridge: the canonical ingredient's id and name.
 *
 * This file used to remember a signed-out visitor's fridge in `localStorage`. The owner decided (wave 10c)
 * that a fridge needs an account and lives in the database, so the browser storage code is gone; only the
 * shared type stays (the filename is kept so the imports do not churn).
 */
export type FridgeItem = { id: number; name: string };
