CREATE TABLE "settings" (
	"id" integer PRIMARY KEY NOT NULL,
	"sol_price_eur" double precision,
	"default_mise" double precision DEFAULT 0.1 NOT NULL,
	"default_objectif" double precision DEFAULT 100 NOT NULL,
	"default_perte_rug" double precision DEFAULT 90 NOT NULL,
	"default_frais" double precision DEFAULT 0.003 NOT NULL,
	"default_taux_vise" double precision DEFAULT 30 NOT NULL,
	"updated_at" text DEFAULT to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"wallet_id" text NOT NULL,
	"position" integer NOT NULL,
	"name" text,
	"mint" text,
	"gain" double precision,
	"perte_rug" double precision,
	"delay" double precision,
	"pris" boolean DEFAULT true NOT NULL,
	"phase" text DEFAULT 'screening' NOT NULL,
	"day_id" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallet_days" (
	"id" text PRIMARY KEY NOT NULL,
	"wallet_id" text NOT NULL,
	"day" text NOT NULL,
	"state" text DEFAULT 'actif' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"address" text NOT NULL,
	"analyzed_at" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"tag_override" text,
	"status" text DEFAULT 'screening' NOT NULL,
	"test_started_at" text,
	"mise" double precision DEFAULT 0.1 NOT NULL,
	"objectif" double precision DEFAULT 100 NOT NULL,
	"perte_rug" double precision DEFAULT 90 NOT NULL,
	"frais" double precision DEFAULT 0.003 NOT NULL,
	"taux_vise" double precision DEFAULT 30 NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_day_id_wallet_days_id_fk" FOREIGN KEY ("day_id") REFERENCES "public"."wallet_days"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_days" ADD CONSTRAINT "wallet_days_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tokens_wallet_position_idx" ON "tokens" USING btree ("wallet_id","position");--> statement-breakpoint
CREATE INDEX "tokens_day_idx" ON "tokens" USING btree ("day_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_days_unique" ON "wallet_days" USING btree ("wallet_id","day");--> statement-breakpoint
CREATE UNIQUE INDEX "wallets_address_unique" ON "wallets" USING btree ("address");--> statement-breakpoint
CREATE INDEX "wallets_analyzed_at_idx" ON "wallets" USING btree ("analyzed_at");--> statement-breakpoint
CREATE INDEX "wallets_status_idx" ON "wallets" USING btree ("status");