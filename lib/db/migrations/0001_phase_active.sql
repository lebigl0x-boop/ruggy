DROP INDEX "wallet_days_unique";--> statement-breakpoint
ALTER TABLE "tokens" ADD COLUMN "entree_sol" double precision;--> statement-breakpoint
ALTER TABLE "tokens" ADD COLUMN "sortie_sol" double precision;--> statement-breakpoint
ALTER TABLE "wallet_days" ADD COLUMN "phase" text DEFAULT 'test' NOT NULL;--> statement-breakpoint
ALTER TABLE "wallets" ADD COLUMN "trade_started_at" text;--> statement-breakpoint
CREATE INDEX "wallet_days_phase_idx" ON "wallet_days" USING btree ("wallet_id","phase");--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_days_unique" ON "wallet_days" USING btree ("wallet_id","day","phase");