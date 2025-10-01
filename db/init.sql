-- Tabela de usuários (admins e clientes)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL, -- 'admin' ou 'client'
    name TEXT,
    phone TEXT
);

-- Tabela de barbeiros
CREATE TABLE IF NOT EXISTS barbers (
    id SERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL
);

-- Tabela de agendamentos
CREATE TABLE IF NOT EXISTS appointments (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL, -- Formato: YYYY-MM-DD
    time TIME NOT NULL, -- Formato: HH:MM
    barber_id INTEGER NOT NULL,
    client_id INTEGER NOT NULL,
    FOREIGN KEY (barber_id) REFERENCES barbers(id) ON DELETE RESTRICT,
    FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE RESTRICT
);

-- Inserir admin padrão (usuário: admin, senha: admin123)
INSERT INTO users (username, password, role, name, phone) 
VALUES ('admin', 'admin123', 'admin', 'Administrador', '123456789')
ON CONFLICT (username) DO NOTHING;

-- Inserir clientes de exemplo
INSERT INTO users (username, password, role, name, phone) 
VALUES 
    ('cliente1', 'cliente123', 'client', 'Cliente Teste 1', '987654321'),
    ('cliente2', 'cliente123', 'client', 'Cliente Teste 2', '912345678')
ON CONFLICT (username) DO NOTHING;

-- Inserir barbeiros de exemplo
INSERT INTO barbers (name) 
VALUES 
    ('João Silva'),
    ('Maria Santos')
ON CONFLICT (name) DO NOTHING;