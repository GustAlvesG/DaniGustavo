-- Fase 6 (docs/saas/fase-6.md): comercial (planos, assinaturas, uso, cadastro self-service,
-- aceite dos termos), domínios verificados, LGPD (consentimento, anonimização, pedidos dos
-- titulares, resumo de evento apagado) e ajustes da gestão (categorias de fornecedor por
-- organização, lembrete semanal de tarefas, modelos de tarefas da plataforma).
-- Gerada pelo drizzle-kit e revisada; vale no MariaDB 10.4 e no MySQL 8. Dados tocados:
-- (1) domínios já cadastrados (vieram da CLI/painel) ficam verificados; (2) o plano interno
-- "Cortesia" (sem limites, sem cobrança, taxa 0) é criado e toda organização que já existe
-- entra nele (em produção, só a organização 1 do casamento). Os demais planos vêm do seed/setup.
CREATE TABLE `platform_task_template_items` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`template_id` bigint unsigned NOT NULL,
	`title` varchar(191) NOT NULL,
	`description` text,
	`category` varchar(32) NOT NULL,
	`offset_days` int NOT NULL,
	`sort` int NOT NULL DEFAULT 0,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `platform_task_template_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `platform_task_templates` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`code` varchar(64) NOT NULL,
	`name` varchar(191) NOT NULL,
	`event_type` varchar(32),
	`description` text,
	`active` boolean NOT NULL DEFAULT true,
	`sort` int NOT NULL DEFAULT 0,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `platform_task_templates_id` PRIMARY KEY(`id`),
	CONSTRAINT `platform_task_templates_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `task_reminder_prefs` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`event_id` bigint unsigned NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`enabled` boolean NOT NULL DEFAULT true,
	`last_week` varchar(10),
	`last_sent_at` datetime(3),
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `task_reminder_prefs_id` PRIMARY KEY(`id`),
	CONSTRAINT `task_reminder_prefs_event_user_idx` UNIQUE(`event_id`,`user_id`)
);
--> statement-breakpoint
CREATE TABLE `vendor_categories` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`organization_id` bigint unsigned NOT NULL,
	`key` varchar(32) NOT NULL,
	`label` varchar(64) NOT NULL,
	`sort` int NOT NULL DEFAULT 0,
	`archived_at` datetime(3),
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `vendor_categories_id` PRIMARY KEY(`id`),
	CONSTRAINT `vendor_categories_org_key_idx` UNIQUE(`organization_id`,`key`)
);
--> statement-breakpoint
CREATE TABLE `legal_acceptances` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`document` enum('terms','privacy') NOT NULL,
	`version` varchar(16) NOT NULL,
	`accepted_at` datetime(3) NOT NULL,
	`ip_hash` varchar(64),
	CONSTRAINT `legal_acceptances_id` PRIMARY KEY(`id`),
	CONSTRAINT `legal_acceptances_user_doc_version_idx` UNIQUE(`user_id`,`document`,`version`)
);
--> statement-breakpoint
CREATE TABLE `organization_subscriptions` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`organization_id` bigint unsigned NOT NULL,
	`plan_id` bigint unsigned NOT NULL,
	`status` enum('trialing','active','past_due','canceled','internal') NOT NULL,
	`billing_cycle` enum('monthly','yearly'),
	`provider` enum('simulado','asaas'),
	`provider_customer_id` varchar(64),
	`provider_subscription_id` varchar(64),
	`trial_ends_at` datetime(3),
	`current_period_ends_at` datetime(3),
	`past_due_since` datetime(3),
	`canceled_at` datetime(3),
	`fee_bps_override` int,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `organization_subscriptions_id` PRIMARY KEY(`id`),
	CONSTRAINT `organization_subscriptions_organization_id_unique` UNIQUE(`organization_id`),
	CONSTRAINT `organization_subscriptions_provider_subscription_id_unique` UNIQUE(`provider_subscription_id`)
);
--> statement-breakpoint
CREATE TABLE `organization_usage` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`organization_id` bigint unsigned NOT NULL,
	`storage_bytes` bigint unsigned NOT NULL DEFAULT 0,
	`computed_at` datetime(3) NOT NULL,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `organization_usage_id` PRIMARY KEY(`id`),
	CONSTRAINT `organization_usage_organization_id_unique` UNIQUE(`organization_id`)
);
--> statement-breakpoint
CREATE TABLE `plans` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`code` varchar(32) NOT NULL,
	`name` varchar(64) NOT NULL,
	`description` text,
	`public` boolean NOT NULL DEFAULT true,
	`active` boolean NOT NULL DEFAULT true,
	`price_monthly_cents` int,
	`price_yearly_cents` int,
	`trial_days` int NOT NULL DEFAULT 0,
	`fee_bps` int NOT NULL DEFAULT 50,
	`limits` json NOT NULL,
	`sort` int NOT NULL DEFAULT 0,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `plans_id` PRIMARY KEY(`id`),
	CONSTRAINT `plans_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `signup_requests` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`email` varchar(191) NOT NULL,
	`name` varchar(191) NOT NULL,
	`organization_name` varchar(191) NOT NULL,
	`plan_code` varchar(32),
	`token_hash` varchar(64) NOT NULL,
	`terms_version` varchar(16) NOT NULL,
	`privacy_version` varchar(16) NOT NULL,
	`ip_hash` varchar(64),
	`expires_at` datetime(3) NOT NULL,
	`confirmed_at` datetime(3),
	`user_id` varchar(36),
	`organization_id` bigint unsigned,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `signup_requests_id` PRIMARY KEY(`id`),
	CONSTRAINT `signup_requests_token_hash_unique` UNIQUE(`token_hash`)
);
--> statement-breakpoint
CREATE TABLE `subscription_payments` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`organization_id` bigint unsigned NOT NULL,
	`subscription_id` bigint unsigned NOT NULL,
	`provider_payment_id` varchar(64) NOT NULL,
	`status` enum('pending','paid','overdue','refunded','canceled') NOT NULL,
	`amount_cents` int NOT NULL,
	`due_on` date NOT NULL,
	`paid_at` datetime(3),
	`invoice_url` varchar(300),
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `subscription_payments_id` PRIMARY KEY(`id`),
	CONSTRAINT `subscription_payments_provider_payment_id_unique` UNIQUE(`provider_payment_id`)
);
--> statement-breakpoint
CREATE TABLE `event_deletions` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`organization_id` bigint unsigned NOT NULL,
	`former_event_id` bigint unsigned NOT NULL,
	`slug` varchar(64) NOT NULL,
	`name` varchar(191) NOT NULL,
	`type` varchar(32) NOT NULL,
	`orders_count` int NOT NULL DEFAULT 0,
	`paid_total_cents` bigint NOT NULL DEFAULT 0,
	`platform_fee_cents` bigint NOT NULL DEFAULT 0,
	`deleted_by` varchar(36),
	`deleted_at` datetime(3) NOT NULL,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `event_deletions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `privacy_requests` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`event_id` bigint unsigned NOT NULL,
	`kind` enum('access','correction','erasure','other') NOT NULL,
	`name` varchar(191) NOT NULL,
	`email` varchar(191) NOT NULL,
	`message` text,
	`status` enum('open','done','rejected') NOT NULL DEFAULT 'open',
	`response` text,
	`resolved_by` varchar(36),
	`resolved_at` datetime(3),
	`ip_hash` varchar(64),
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `privacy_requests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `gift_orders` ADD `anonymized_at` datetime(3);--> statement-breakpoint
ALTER TABLE `invitations` ADD `consent_at` datetime(3);--> statement-breakpoint
ALTER TABLE `invitations` ADD `consent_version` varchar(16);--> statement-breakpoint
ALTER TABLE `invitations` ADD `anonymized_at` datetime(3);--> statement-breakpoint
ALTER TABLE `messages` ADD `consent_at` datetime(3);--> statement-breakpoint
ALTER TABLE `messages` ADD `consent_version` varchar(16);--> statement-breakpoint
ALTER TABLE `event_domains` ADD `kind` enum('platform','custom') DEFAULT 'custom' NOT NULL;--> statement-breakpoint
ALTER TABLE `event_domains` ADD `verification_token` varchar(64);--> statement-breakpoint
ALTER TABLE `event_domains` ADD `verified_at` datetime(3);--> statement-breakpoint
ALTER TABLE `event_domains` ADD `last_checked_at` datetime(3);--> statement-breakpoint
ALTER TABLE `event_domains` ADD `check_error` varchar(191);--> statement-breakpoint
ALTER TABLE `events` ADD `personal_data_purged_at` datetime(3);--> statement-breakpoint
ALTER TABLE `platform_task_template_items` ADD CONSTRAINT `platform_task_items_template_fk` FOREIGN KEY (`template_id`) REFERENCES `platform_task_templates`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `task_reminder_prefs` ADD CONSTRAINT `task_reminder_prefs_event_id_events_id_fk` FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `task_reminder_prefs` ADD CONSTRAINT `task_reminder_prefs_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vendor_categories` ADD CONSTRAINT `vendor_categories_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `legal_acceptances` ADD CONSTRAINT `legal_acceptances_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `organization_subscriptions` ADD CONSTRAINT `organization_subscriptions_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `organization_subscriptions` ADD CONSTRAINT `organization_subscriptions_plan_id_plans_id_fk` FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `organization_usage` ADD CONSTRAINT `organization_usage_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `signup_requests` ADD CONSTRAINT `signup_requests_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `signup_requests` ADD CONSTRAINT `signup_requests_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `subscription_payments` ADD CONSTRAINT `subscription_payments_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `subscription_payments` ADD CONSTRAINT `subscription_payments_subscription_fk` FOREIGN KEY (`subscription_id`) REFERENCES `organization_subscriptions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `event_deletions` ADD CONSTRAINT `event_deletions_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `event_deletions` ADD CONSTRAINT `event_deletions_deleted_by_user_id_fk` FOREIGN KEY (`deleted_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `privacy_requests` ADD CONSTRAINT `privacy_requests_event_id_events_id_fk` FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `privacy_requests` ADD CONSTRAINT `privacy_requests_resolved_by_user_id_fk` FOREIGN KEY (`resolved_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `platform_task_template_items_template_idx` ON `platform_task_template_items` (`template_id`,`sort`);--> statement-breakpoint
CREATE INDEX `organization_subscriptions_plan_idx` ON `organization_subscriptions` (`plan_id`);--> statement-breakpoint
CREATE INDEX `signup_requests_email_idx` ON `signup_requests` (`email`);--> statement-breakpoint
CREATE INDEX `subscription_payments_org_due_idx` ON `subscription_payments` (`organization_id`,`due_on`);--> statement-breakpoint
CREATE INDEX `event_deletions_org_idx` ON `event_deletions` (`organization_id`);--> statement-breakpoint
CREATE INDEX `privacy_requests_event_status_idx` ON `privacy_requests` (`event_id`,`status`);
--> statement-breakpoint
UPDATE `event_domains` SET `verified_at` = `created_at` WHERE `verified_at` IS NULL;--> statement-breakpoint
INSERT INTO `plans` (`code`, `name`, `description`, `public`, `active`, `trial_days`, `fee_bps`, `limits`, `sort`, `created_at`, `updated_at`) VALUES ('cortesia', 'Cortesia', 'Plano interno da plataforma: sem limites, sem cobrança e sem taxa.', false, true, 0, 0, '{"activeEvents":null,"guestsPerEvent":null,"members":null,"storageMb":null,"modules":null}', 100, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3));--> statement-breakpoint
INSERT INTO `organization_subscriptions` (`organization_id`, `plan_id`, `status`, `created_at`, `updated_at`) SELECT o.`id`, p.`id`, 'internal', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3) FROM `organizations` o JOIN `plans` p ON p.`code` = 'cortesia';
