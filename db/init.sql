-- Tabela de usuários (admins e clientes)
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL, -- 'admin' ou 'client'
    name TEXT,
    phone TEXT
);

-- Tabela de barbeiros
CREATE TABLE IF NOT EXISTS barbers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL
);

-- Tabela de agendamentos
CREATE TABLE IF NOT EXISTS appointments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL, -- Formato: YYYY-MM-DD
    time TEXT NOT NULL, -- Formato: HH:00
    barber_id INTEGER NOT NULL,
    client_id INTEGER NOT NULL,
    FOREIGN KEY (barber_id) REFERENCES barbers(id),
    FOREIGN KEY (client_id) REFERENCES users(id)
);

-- Inserir admin padrão (usuário: admin, senha: admin123)
INSERT OR IGNORE INTO users (username, password, role, name, phone) 
VALUES ('admin', '$2b$10$K.0XbKq7z7z7z7z7z7z7z.O', 'admin', 'Administrador', '123456789');

-- Inserir barbeiros de exemplo
INSERT OR IGNORE INTO barbers (name) VALUES ('João Silva');
INSERT OR IGNORE INTO barbers (name) VALUES ('Maria Santos');