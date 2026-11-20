-- Fase 3 (painel da organização): convites por e-mail para a equipe da organização
-- (owner/member, event_id nulo) e para anfitrião de evento (host, event_id preenchido).
-- Só cria tabela: vale no MariaDB 10.4 e no MySQL 8 e não toca em dados existentes.
CREATE TABLE `team_invites` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`organization_id` bigint unsigned NOT NULL,
	`event_id` bigint unsigned,
	`email` varchar(191) NOT NULL,
	`role` enum('owner','member','host') NOT NULL,
	`token_hash` varchar(64) NOT NULL,
	`invited_by` varchar(36),
	`expires_at` datetime(3) NOT NULL,
	`accepted_at` datetime(3),
	`accepted_by` varchar(36),
	`revoked_at` datetime(3),
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `team_invites_id` PRIMARY KEY(`id`),
	CONSTRAINT `team_invites_token_hash_unique` UNIQUE(`token_hash`)
);
--> statement-breakpoint
ALTER TABLE `team_invites` ADD CONSTRAINT `team_invites_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `team_invites` ADD CONSTRAINT `team_invites_event_id_events_id_fk` FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `team_invites` ADD CONSTRAINT `team_invites_invited_by_user_id_fk` FOREIGN KEY (`invited_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `team_invites` ADD CONSTRAINT `team_invites_accepted_by_user_id_fk` FOREIGN KEY (`accepted_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `team_invites_org_email_idx` ON `team_invites` (`organization_id`,`email`);--> statement-breakpoint
CREATE INDEX `team_invites_event_id_idx` ON `team_invites` (`event_id`);