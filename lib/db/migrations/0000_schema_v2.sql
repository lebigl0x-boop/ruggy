CREATE TABLE "jours" (
	"id" text PRIMARY KEY NOT NULL,
	"wallet_id" text NOT NULL,
	"jour" text NOT NULL,
	"cree_le" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"wallet_id" text NOT NULL,
	"phase" text NOT NULL,
	"jour" text,
	"nom" text,
	"mint" text,
	"issue" text NOT NULL,
	"position" integer NOT NULL,
	"cree_le" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trades" (
	"id" text PRIMARY KEY NOT NULL,
	"wallet_id" text NOT NULL,
	"date" text NOT NULL,
	"nom" text,
	"mint" text,
	"entree_sol" double precision NOT NULL,
	"sortie_sol" double precision NOT NULL,
	"issue" text NOT NULL,
	"cree_le" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"id" text PRIMARY KEY NOT NULL,
	"nom" text NOT NULL,
	"adresse" text NOT NULL,
	"phase" text DEFAULT 'screening' NOT NULL,
	"mise" double precision DEFAULT 0.05 NOT NULL,
	"tp" double precision DEFAULT 300 NOT NULL,
	"frais" double precision DEFAULT 0.008 NOT NULL,
	"tokens_screening" integer DEFAULT 10 NOT NULL,
	"jours_test" integer DEFAULT 5 NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"cree_le" text NOT NULL,
	"test_le" text,
	"trade_le" text
);
--> statement-breakpoint
ALTER TABLE "jours" ADD CONSTRAINT "jours_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "jours_unique" ON "jours" USING btree ("wallet_id","jour");--> statement-breakpoint
CREATE INDEX "tokens_wallet_phase_idx" ON "tokens" USING btree ("wallet_id","phase");--> statement-breakpoint
CREATE INDEX "tokens_jour_idx" ON "tokens" USING btree ("wallet_id","jour");--> statement-breakpoint
CREATE INDEX "trades_wallet_date_idx" ON "trades" USING btree ("wallet_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "wallets_adresse_unique" ON "wallets" USING btree ("adresse");--> statement-breakpoint
CREATE INDEX "wallets_phase_idx" ON "wallets" USING btree ("phase");