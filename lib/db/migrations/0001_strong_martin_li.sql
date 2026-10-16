CREATE TABLE "analyses" (
	"id" text PRIMARY KEY NOT NULL,
	"wallet_id" text NOT NULL,
	"jour" text NOT NULL,
	"mint" text NOT NULL,
	"nom" text,
	"signature" text NOT NULL,
	"achete_a" text NOT NULL,
	"sol_paye" double precision NOT NULL,
	"tokens_recus" double precision NOT NULL,
	"decimales" integer NOT NULL,
	"mc_entree_sol" double precision NOT NULL,
	"ath_mc_sol" double precision,
	"ath_a" text,
	"multiple" double precision,
	"ath_partiel" boolean DEFAULT false NOT NULL,
	"erreur" text,
	"analyse_le" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "analyses_unique" ON "analyses" USING btree ("wallet_id","jour","mint");--> statement-breakpoint
CREATE INDEX "analyses_wallet_jour_idx" ON "analyses" USING btree ("wallet_id","jour");