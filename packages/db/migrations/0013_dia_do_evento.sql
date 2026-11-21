-- Fase 7 (docs/saas/fase-7.md): o dia do evento. Check-in pela portaria (link + PIN, chegadas
-- parciais com desfazer), mapa de mesas (mesas e lugares por pessoa), portal do fornecedor
-- (link mágico; orçamento e documentos enviados por ele marcados com `source = 'portal'`),
-- WhatsApp por links prontos (modelos e "enviado" marcado pelo organizador), aviso da portaria
-- no convite (`invitations.access_note`) e fornecedor responsável na tarefa
-- (`event_tasks.event_vendor_id`). Gerada pelo drizzle-kit e revisada; vale no MariaDB 10.4 e
-- no MySQL 8 (nomes de constraint ≤ 64 caracteres). Nenhum dado existente é alterado; a única
-- mudança em tabela antiga além de colunas novas é o índice único (event_id, id) de `guests`,
-- alvo da FK composta de `seat_assignments`.
CREATE TABLE `checkin_links` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`event_id` bigint unsigned NOT NULL,
	`label` varchar(64) NOT NULL,
	`token_hash` varchar(64) NOT NULL,
	`pin_hash` varchar(191) NOT NULL,
	`pin_failures` int NOT NULL DEFAULT 0,
	`locked_until` datetime(3),
	`expires_at` datetime(3) NOT NULL,
	`revoked_at` datetime(3),
	`last_used_at` datetime(3),
	`created_by` varchar(36),
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `checkin_links_id` PRIMARY KEY(`id`),
	CONSTRAINT `checkin_links_token_hash_unique` UNIQUE(`token_hash`),
	CONSTRAINT `checkin_links_event_id_id_idx` UNIQUE(`event_id`,`id`)
);
--> statement-breakpoint
CREATE TABLE `checkins` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`event_id` bigint unsigned NOT NULL,
	`invitation_id` bigint unsigned NOT NULL,
	`people` int NOT NULL,
	`checkin_link_id` bigint unsigned,
	`user_id` varchar(36),
	`undone_at` datetime(3),
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `checkins_id` PRIMARY KEY(`id`),
	CONSTRAINT `checkins_event_id_id_idx` UNIQUE(`event_id`,`id`)
);
--> statement-breakpoint
CREATE TABLE `seat_assignments` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`event_id` bigint unsigned NOT NULL,
	`table_id` bigint unsigned NOT NULL,
	`guest_id` bigint unsigned NOT NULL,
	`seat` int,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `seat_assignments_id` PRIMARY KEY(`id`),
	CONSTRAINT `seat_assignments_event_guest_idx` UNIQUE(`event_id`,`guest_id`),
	CONSTRAINT `seat_assignments_event_table_seat_idx` UNIQUE(`event_id`,`table_id`,`seat`)
);
--> statement-breakpoint
CREATE TABLE `seating_tables` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`event_id` bigint unsigned NOT NULL,
	`name` varchar(64) NOT NULL,
	`seats` int NOT NULL DEFAULT 8,
	`sort` int NOT NULL DEFAULT 0,
	`side` varchar(32),
	`group_label` varchar(64),
	`notes` varchar(300),
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `seating_tables_id` PRIMARY KEY(`id`),
	CONSTRAINT `seating_tables_event_id_id_idx` UNIQUE(`event_id`,`id`)
);
--> statement-breakpoint
CREATE TABLE `vendor_portal_links` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`event_id` bigint unsigned NOT NULL,
	`event_vendor_id` bigint unsigned NOT NULL,
	`token_hash` varchar(64) NOT NULL,
	`email` varchar(191) NOT NULL,
	`expires_at` datetime(3) NOT NULL,
	`revoked_at` datetime(3),
	`last_used_at` datetime(3),
	`created_by` varchar(36),
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `vendor_portal_links_id` PRIMARY KEY(`id`),
	CONSTRAINT `vendor_portal_links_token_hash_unique` UNIQUE(`token_hash`),
	CONSTRAINT `vendor_portal_links_event_id_id_idx` UNIQUE(`event_id`,`id`)
);
--> statement-breakpoint
CREATE TABLE `whatsapp_sends` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`event_id` bigint unsigned NOT NULL,
	`invitation_id` bigint unsigned NOT NULL,
	`kind` varchar(32) NOT NULL,
	`marked_by` varchar(36),
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `whatsapp_sends_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `whatsapp_templates` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`event_id` bigint unsigned NOT NULL,
	`kind` varchar(32) NOT NULL,
	`body` text NOT NULL,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `whatsapp_templates_id` PRIMARY KEY(`id`),
	CONSTRAINT `whatsapp_templates_event_kind_idx` UNIQUE(`event_id`,`kind`)
);
--> statement-breakpoint
ALTER TABLE `invitations` ADD `access_note` varchar(191);--> statement-breakpoint
ALTER TABLE `event_tasks` ADD `event_vendor_id` bigint unsigned;--> statement-breakpoint
ALTER TABLE `quotes` ADD `source` enum('panel','portal') DEFAULT 'panel' NOT NULL;--> statement-breakpoint
ALTER TABLE `quotes` ADD `portal_link_id` bigint unsigned;--> statement-breakpoint
ALTER TABLE `vendor_contracts` ADD `source` enum('panel','portal') DEFAULT 'panel' NOT NULL;--> statement-breakpoint
ALTER TABLE `vendor_contracts` ADD `portal_link_id` bigint unsigned;--> statement-breakpoint
ALTER TABLE `guests` ADD CONSTRAINT `guests_event_id_id_idx` UNIQUE(`event_id`,`id`);--> statement-breakpoint
ALTER TABLE `checkin_links` ADD CONSTRAINT `checkin_links_event_id_events_id_fk` FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `checkin_links` ADD CONSTRAINT `checkin_links_created_by_user_id_fk` FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `checkins` ADD CONSTRAINT `checkins_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `checkins` ADD CONSTRAINT `checkins_invitation_fk` FOREIGN KEY (`event_id`,`invitation_id`) REFERENCES `invitations`(`event_id`,`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `seat_assignments` ADD CONSTRAINT `seat_assignments_table_fk` FOREIGN KEY (`event_id`,`table_id`) REFERENCES `seating_tables`(`event_id`,`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `seat_assignments` ADD CONSTRAINT `seat_assignments_guest_fk` FOREIGN KEY (`event_id`,`guest_id`) REFERENCES `guests`(`event_id`,`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `seating_tables` ADD CONSTRAINT `seating_tables_event_id_events_id_fk` FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vendor_portal_links` ADD CONSTRAINT `vendor_portal_links_created_by_user_id_fk` FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vendor_portal_links` ADD CONSTRAINT `vendor_portal_links_vendor_fk` FOREIGN KEY (`event_id`,`event_vendor_id`) REFERENCES `event_vendors`(`event_id`,`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `whatsapp_sends` ADD CONSTRAINT `whatsapp_sends_marked_by_user_id_fk` FOREIGN KEY (`marked_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `whatsapp_sends` ADD CONSTRAINT `whatsapp_sends_invitation_fk` FOREIGN KEY (`event_id`,`invitation_id`) REFERENCES `invitations`(`event_id`,`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `whatsapp_templates` ADD CONSTRAINT `whatsapp_templates_event_id_events_id_fk` FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `checkins_event_invitation_idx` ON `checkins` (`event_id`,`invitation_id`);--> statement-breakpoint
CREATE INDEX `checkins_event_created_idx` ON `checkins` (`event_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `seating_tables_event_sort_idx` ON `seating_tables` (`event_id`,`sort`);--> statement-breakpoint
CREATE INDEX `vendor_portal_links_event_vendor_idx` ON `vendor_portal_links` (`event_id`,`event_vendor_id`);--> statement-breakpoint
CREATE INDEX `whatsapp_sends_event_kind_inv_idx` ON `whatsapp_sends` (`event_id`,`kind`,`invitation_id`);--> statement-breakpoint
CREATE INDEX `event_tasks_event_vendor_idx` ON `event_tasks` (`event_id`,`event_vendor_id`);