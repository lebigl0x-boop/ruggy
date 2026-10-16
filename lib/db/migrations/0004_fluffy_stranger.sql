ALTER TABLE "analyses" ADD COLUMN "prix_entree" double precision;--> statement-breakpoint
ALTER TABLE "analyses" ADD COLUMN "prix_sommet_brut" double precision;--> statement-breakpoint
ALTER TABLE "analyses" ADD COLUMN "prix_sommet_exec" double precision;--> statement-breakpoint
ALTER TABLE "analyses" ADD COLUMN "sommet_brut_a" text;--> statement-breakpoint
ALTER TABLE "analyses" ADD COLUMN "sommet_exec_a" text;--> statement-breakpoint
ALTER TABLE "analyses" ADD COLUMN "trou_max" integer;