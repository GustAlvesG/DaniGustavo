-- Plataforma multi-evento (Fase 1, etapa 1). Escrita à mão a partir do SQL do drizzle-kit:
-- o site do casamento vira "Organização 1 → Evento 1" sem perder dados. Ordem:
-- 1) tabelas novas; 2) organização 1; 3) evento 1 (dados de `settings`); 4) `event_id` em cada
-- tabela (NULL → UPDATE 1 → NOT NULL DEFAULT 1, provisório até a 0007), índices e FKs;
-- 5) `settings` → `event_settings`; 6) slug dos presentes único por evento; 7) colunas avulsas.
-- Domínios e membros dependem do .env e ficam com o seed/CLI.

-- 1. Tabelas novas
CREATE TABLE `organizations` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`slug` varchar(64) NOT NULL,
	`name` varchar(191) NOT NULL,
	`status` enum('active','suspended') NOT NULL DEFAULT 'active',
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `organizations_id` PRIMARY KEY(`id`),
	CONSTRAINT `organizations_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`organization_id` bigint unsigned NOT NULL,
	`slug` varchar(64) NOT NULL,
	`type` varchar(32) NOT NULL DEFAULT 'wedding',
	`name` varchar(191) NOT NULL,
	`status` enum('draft','active','archived') NOT NULL DEFAULT 'draft',
	`timezone` varchar(64) NOT NULL DEFAULT 'America/Sao_Paulo',
	`starts_at` datetime(3),
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `events_id` PRIMARY KEY(`id`),
	CONSTRAINT `events_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE INDEX `events_organization_id_idx` ON `events` (`organization_id`);--> statement-breakpoint
ALTER TABLE `events` ADD CONSTRAINT `events_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE TABLE `event_domains` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`event_id` bigint unsigned NOT NULL,
	`host` varchar(191) NOT NULL,
	`is_primary` boolean NOT NULL DEFAULT false,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `event_domains_id` PRIMARY KEY(`id`),
	CONSTRAINT `event_domains_host_unique` UNIQUE(`host`)
);
--> statement-breakpoint
CREATE INDEX `event_domains_event_id_idx` ON `event_domains` (`event_id`);--> statement-breakpoint
ALTER TABLE `event_domains` ADD CONSTRAINT `event_domains_event_id_events_id_fk` FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE TABLE `organization_members` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`organization_id` bigint unsigned NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`role` enum('owner','member') NOT NULL,
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `organization_members_id` PRIMARY KEY(`id`),
	CONSTRAINT `organization_members_org_user_idx` UNIQUE(`organization_id`,`user_id`)
);
--> statement-breakpoint
CREATE INDEX `organization_members_user_id_idx` ON `organization_members` (`user_id`);--> statement-breakpoint
ALTER TABLE `organization_members` ADD CONSTRAINT `organization_members_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `organization_members` ADD CONSTRAINT `organization_members_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE TABLE `event_members` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`event_id` bigint unsigned NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`role` enum('host') NOT NULL,
	`created_at` datetime(3) NOT NULL,
	CONSTRAINT `event_members_id` PRIMARY KEY(`id`),
	CONSTRAINT `event_members_event_user_idx` UNIQUE(`event_id`,`user_id`)
);
--> statement-breakpoint
CREATE INDEX `event_members_user_id_idx` ON `event_members` (`user_id`);--> statement-breakpoint
ALTER TABLE `event_members` ADD CONSTRAINT `event_members_event_id_events_id_fk` FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `event_members` ADD CONSTRAINT `event_members_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- 2. Organização 1
INSERT INTO `organizations` (`id`, `slug`, `name`, `status`, `created_at`, `updated_at`)
VALUES (1, 'org-1', 'Organização 1', 'active', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3));
--> statement-breakpoint

-- 3. Evento 1, com nome, fuso e data lidos de `settings` (JSON_UNQUOTE vale no MariaDB e no
-- MySQL). A data vem como ISO com offset ("2027-04-10T16:00:00-03:00") e é gravada em UTC;
-- CONVERT_TZ com offsets numéricos não depende das tabelas de fuso do servidor.
INSERT INTO `events` (`id`, `organization_id`, `slug`, `type`, `name`, `status`, `timezone`, `starts_at`, `created_at`, `updated_at`)
SELECT 1, 1, 'dani-gustavo', 'wedding',
	LEFT(COALESCE(s.`name`, 'Evento 1'), 191),
	'active',
	LEFT(COALESCE(s.`tz`, 'America/Sao_Paulo'), 64),
	CASE
		WHEN s.`dt` REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]+)?[+-][0-9]{2}:[0-9]{2}$'
			THEN CONVERT_TZ(STR_TO_DATE(LEFT(s.`dt`, 19), '%Y-%m-%dT%H:%i:%s'), RIGHT(s.`dt`, 6), '+00:00')
		WHEN s.`dt` REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]+)?Z$'
			THEN STR_TO_DATE(LEFT(s.`dt`, 19), '%Y-%m-%dT%H:%i:%s')
		ELSE NULL
	END,
	UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)
FROM (
	SELECT
		(SELECT JSON_UNQUOTE(`value`) FROM `settings` WHERE `key` = 'couple.names') AS `name`,
		(SELECT JSON_UNQUOTE(`value`) FROM `settings` WHERE `key` = 'wedding.timezone') AS `tz`,
		(SELECT JSON_UNQUOTE(`value`) FROM `settings` WHERE `key` = 'wedding.datetime') AS `dt`
) AS s;
--> statement-breakpoint

-- 4. event_id nas tabelas do evento (pais antes das filhas: as FKs compostas apontam para
-- o único (event_id, id) do pai).

-- invitations
ALTER TABLE `invitations` ADD `event_id` bigint unsigned NULL AFTER `id`;--> statement-breakpoint
UPDATE `invitations` SET `event_id` = 1;--> statement-breakpoint
ALTER TABLE `invitations` MODIFY `event_id` bigint unsigned NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `invitations` ADD CONSTRAINT `invitations_event_id_id_idx` UNIQUE(`event_id`,`id`);--> statement-breakpoint
ALTER TABLE `invitations` ADD CONSTRAINT `invitations_event_id_events_id_fk` FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- guests: a FK simples para invitations vira composta (event_id, invitation_id)
ALTER TABLE `guests` DROP FOREIGN KEY `guests_invitation_id_invitations_id_fk`;--> statement-breakpoint
DROP INDEX `guests_invitation_id_idx` ON `guests`;--> statement-breakpoint
ALTER TABLE `guests` ADD `event_id` bigint unsigned NULL AFTER `id`;--> statement-breakpoint
UPDATE `guests` SET `event_id` = 1;--> statement-breakpoint
ALTER TABLE `guests` MODIFY `event_id` bigint unsigned NOT NULL DEFAULT 1;--> statement-breakpoint
CREATE INDEX `guests_event_invitation_idx` ON `guests` (`event_id`,`invitation_id`);--> statement-breakpoint
ALTER TABLE `guests` ADD CONSTRAINT `guests_event_id_events_id_fk` FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `guests` ADD CONSTRAINT `guests_invitation_fk` FOREIGN KEY (`event_id`,`invitation_id`) REFERENCES `invitations`(`event_id`,`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- rsvp_logs
ALTER TABLE `rsvp_logs` ADD `event_id` bigint unsigned NULL AFTER `id`;--> statement-breakpoint
UPDATE `rsvp_logs` SET `event_id` = 1;--> statement-breakpoint
ALTER TABLE `rsvp_logs` MODIFY `event_id` bigint unsigned NOT NULL DEFAULT 1;--> statement-breakpoint
CREATE INDEX `rsvp_logs_event_id_idx` ON `rsvp_logs` (`event_id`);--> statement-breakpoint
ALTER TABLE `rsvp_logs` ADD CONSTRAINT `rsvp_logs_event_id_events_id_fk` FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- rsvp_reminders
ALTER TABLE `rsvp_reminders` ADD `event_id` bigint unsigned NULL AFTER `id`;--> statement-breakpoint
UPDATE `rsvp_reminders` SET `event_id` = 1;--> statement-breakpoint
ALTER TABLE `rsvp_reminders` MODIFY `event_id` bigint unsigned NOT NULL DEFAULT 1;--> statement-breakpoint
CREATE INDEX `rsvp_reminders_event_id_idx` ON `rsvp_reminders` (`event_id`);--> statement-breakpoint
ALTER TABLE `rsvp_reminders` ADD CONSTRAINT `rsvp_reminders_event_id_events_id_fk` FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- gifts (o índice de vitrine passa a começar pelo evento; o slug é tratado no passo 6)
DROP INDEX `gifts_active_sort_idx` ON `gifts`;--> statement-breakpoint
ALTER TABLE `gifts` ADD `event_id` bigint unsigned NULL AFTER `id`;--> statement-breakpoint
UPDATE `gifts` SET `event_id` = 1;--> statement-breakpoint
ALTER TABLE `gifts` MODIFY `event_id` bigint unsigned NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `gifts` ADD CONSTRAINT `gifts_event_id_id_idx` UNIQUE(`event_id`,`id`);--> statement-breakpoint
CREATE INDEX `gifts_event_active_sort_idx` ON `gifts` (`event_id`,`active`,`sort`);--> statement-breakpoint
ALTER TABLE `gifts` ADD CONSTRAINT `gifts_event_id_events_id_fk` FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- gift_orders: FK simples para gifts vira composta; restrict ao apagar o evento
ALTER TABLE `gift_orders` DROP FOREIGN KEY `gift_orders_gift_id_gifts_id_fk`;--> statement-breakpoint
DROP INDEX `gift_orders_gift_id_idx` ON `gift_orders`;--> statement-breakpoint
ALTER TABLE `gift_orders` ADD `event_id` bigint unsigned NULL AFTER `public_id`;--> statement-breakpoint
UPDATE `gift_orders` SET `event_id` = 1;--> statement-breakpoint
ALTER TABLE `gift_orders` MODIFY `event_id` bigint unsigned NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `gift_orders` ADD CONSTRAINT `gift_orders_event_id_id_idx` UNIQUE(`event_id`,`id`);--> statement-breakpoint
CREATE INDEX `gift_orders_event_status_created_idx` ON `gift_orders` (`event_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `gift_orders_event_gift_idx` ON `gift_orders` (`event_id`,`gift_id`);--> statement-breakpoint
ALTER TABLE `gift_orders` ADD CONSTRAINT `gift_orders_event_id_events_id_fk` FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `gift_orders` ADD CONSTRAINT `gift_orders_gift_fk` FOREIGN KEY (`event_id`,`gift_id`) REFERENCES `gifts`(`event_id`,`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

-- payments: FK simples para gift_orders vira composta
ALTER TABLE `payments` DROP FOREIGN KEY `payments_order_id_gift_orders_id_fk`;--> statement-breakpoint
DROP INDEX `payments_order_id_idx` ON `payments`;--> statement-breakpoint
ALTER TABLE `payments` ADD `event_id` bigint unsigned NULL AFTER `id`;--> statement-breakpoint
UPDATE `payments` SET `event_id` = 1;--> statement-breakpoint
ALTER TABLE `payments` MODIFY `event_id` bigint unsigned NOT NULL DEFAULT 1;--> statement-breakpoint
CREATE INDEX `payments_event_order_idx` ON `payments` (`event_id`,`order_id`);--> statement-breakpoint
ALTER TABLE `payments` ADD CONSTRAINT `payments_event_id_events_id_fk` FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payments` ADD CONSTRAINT `payments_order_fk` FOREIGN KEY (`event_id`,`order_id`) REFERENCES `gift_orders`(`event_id`,`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint

-- messages (gift_order_id segue com FK simples SET NULL; conferência na aplicação)
DROP INDEX `messages_approved_idx` ON `messages`;--> statement-breakpoint
ALTER TABLE `messages` ADD `event_id` bigint unsigned NULL AFTER `id`;--> statement-breakpoint
UPDATE `messages` SET `event_id` = 1;--> statement-breakpoint
ALTER TABLE `messages` MODIFY `event_id` bigint unsigned NOT NULL DEFAULT 1;--> statement-breakpoint
CREATE INDEX `messages_event_approved_idx` ON `messages` (`event_id`,`approved`);--> statement-breakpoint
ALTER TABLE `messages` ADD CONSTRAINT `messages_event_id_events_id_fk` FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- 5. settings → event_settings (PK evento + chave)
CREATE TABLE `event_settings` (
	`event_id` bigint unsigned NOT NULL,
	`key` varchar(100) NOT NULL,
	`value` json NOT NULL,
	`is_public` boolean NOT NULL DEFAULT true,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `event_settings_pk` PRIMARY KEY(`event_id`,`key`)
);
--> statement-breakpoint
ALTER TABLE `event_settings` ADD CONSTRAINT `event_settings_event_id_events_id_fk` FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
INSERT INTO `event_settings` (`event_id`, `key`, `value`, `is_public`, `created_at`, `updated_at`)
SELECT 1, `key`, `value`, `is_public`, `created_at`, `updated_at` FROM `settings`;--> statement-breakpoint
DROP TABLE `settings`;--> statement-breakpoint

-- 6. Slug dos presentes: único por evento (dois eventos podem ter "air-fryer")
ALTER TABLE `gifts` DROP INDEX `gifts_slug_unique`;--> statement-breakpoint
ALTER TABLE `gifts` ADD CONSTRAINT `gifts_event_slug_idx` UNIQUE(`event_id`,`slug`);--> statement-breakpoint

-- 7. Colunas avulsas: papel na plataforma e evento do webhook (auditoria; a tabela é global).
-- `webhook_events.event_id` já é o id do evento no provedor, por isso `app_event_id`.
ALTER TABLE `user` ADD `platform_role` varchar(32);--> statement-breakpoint
ALTER TABLE `webhook_events` ADD `app_event_id` bigint unsigned AFTER `event_id`;--> statement-breakpoint
UPDATE `webhook_events` SET `app_event_id` = 1;--> statement-breakpoint
CREATE INDEX `webhook_events_app_event_id_idx` ON `webhook_events` (`app_event_id`);--> statement-breakpoint
ALTER TABLE `webhook_events` ADD CONSTRAINT `webhook_events_app_event_id_events_id_fk` FOREIGN KEY (`app_event_id`) REFERENCES `events`(`id`) ON DELETE set null ON UPDATE no action;
