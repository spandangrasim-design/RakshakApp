CREATE TABLE IF NOT EXISTS admin_configurations (
    key_name TEXT PRIMARY KEY,
    key_value TEXT NOT NULL,
    description TEXT
);

-- Insert the initial empty rows for the Admin UI to populate
INSERT INTO admin_configurations (key_name, key_value, description) VALUES
('GMAIL_ACCESS_TOKEN', '', 'OAuth2 Access Token for Google Mail API'),
('MANAGER_EMAIL', '', 'Destination email for SLA escalations'),
('WHATSAPP_API_TOKEN', '', 'Meta WhatsApp Graph API Token'),
('TELEGRAM_BOT_TOKEN', '', 'Telegram Bot Token')
ON CONFLICT (key_name) DO NOTHING;