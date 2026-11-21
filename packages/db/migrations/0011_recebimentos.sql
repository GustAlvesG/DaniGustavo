-- Fase 5 (recebimentos: subcontas do provedor por organização/pessoa e split da plataforma).
-- Gerada pelo drizzle-kit e revisada: cria `payment_accounts`, liga o evento à conta recebedora
-- (FK composta: mesma organização) e guarda no pedido a conta e a taxa da plataforma. Vale no
-- MariaDB 10.4 e no MySQL 8. Único dado tocado: eventos que já existem passam a receber pela
-- conta principal da plataforma (`platform`), como antes da Fase 5; eventos novos nascem com
-- `organization` (subconta da organização).
CREATE TABLE `payment_accounts` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`organization_id` bigint unsigned NOT NULL,
	`holder` enum('organization','user') NOT NULL,
	`user_id` varchar(36),
	`provider` enum('simulado','asaas') NOT NULL,
	`public_id` varchar(26) NOT NULL,
	`provider_account_id` varchar(64),
	`wallet_id` varchar(64),
	`api_key_enc` text,
	`webhook_token_hash` varchar(64),
	`person_type` enum('individual','company') NOT NULL,
	`company_type` varchar(16),
	`name` varchar(191) NOT NULL,
	`email` varchar(191) NOT NULL,
	`document_hint` varchar(32) NOT NULL,
	`status` enum('pending','awaiting_approval','approved','rejected','disabled') NOT NULL DEFAULT 'pending',
	`kyc` json,
	`status_checked_at` datetime(3),
	`approved_at` datetime(3),
	`disabled_at` datetime(3),
	`created_by` varchar(36),
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `payment_accounts_id` PRIMARY KEY(`id`),
	CONSTRAINT `payment_accounts_public_id_unique` UNIQUE(`public_id`),
	CONSTRAINT `payment_accounts_wallet_id_unique` UNIQUE(`wallet_id`),
	CONSTRAINT `payment_accounts_org_id_id_idx` UNIQUE(`organization_id`,`id`)
);
--> statement-breakpoint
ALTER TABLE `gift_orders` ADD `payment_account_id` bigint unsigned;--> statement-breakpoint
ALTER TABLE `gift_orders` ADD `platform_fee_bps` int;--> statement-breakpoint
ALTER TABLE `gift_orders` ADD `platform_fee_cents` int;--> statement-breakpoint
ALTER TABLE `events` ADD `payment_receiver` enum('organization','host','platform') DEFAULT 'organization' NOT NULL;--> statement-breakpoint
ALTER TABLE `events` ADD `receiving_account_id` bigint unsigned;--> statement-breakpoint
ALTER TABLE `payment_accounts` ADD CONSTRAINT `payment_accounts_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payment_accounts` ADD CONSTRAINT `payment_accounts_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payment_accounts` ADD CONSTRAINT `payment_accounts_created_by_user_id_fk` FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `payment_accounts_org_holder_idx` ON `payment_accounts` (`organization_id`,`holder`);--> statement-breakpoint
CREATE INDEX `payment_accounts_user_id_idx` ON `payment_accounts` (`user_id`);--> statement-breakpoint
ALTER TABLE `gift_orders` ADD CONSTRAINT `gift_orders_payment_account_id_payment_accounts_id_fk` FOREIGN KEY (`payment_account_id`) REFERENCES `payment_accounts`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `events` ADD CONSTRAINT `events_receiving_account_fk` FOREIGN KEY (`organization_id`,`receiving_account_id`) REFERENCES `payment_accounts`(`organization_id`,`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `gift_orders_payment_account_idx` ON `gift_orders` (`payment_account_id`);--> statement-breakpoint
UPDATE `events` SET `payment_receiver` = 'platform';
