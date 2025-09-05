const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const app = express();

const dbPath = process.env.VERCEL ? '/tmp/barbershop.db' : './db/barbershop.db';
if (!process.env.VERCEL) {
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
    }
}
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Erro ao conectar ao banco de dados:', err);
    } else {
        console.log('Conectado ao banco de dados:', dbPath);
    }
});

app.use(express.json());
app.use(express.static('public'));

// Criação das tabelas
db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password TEXT,
            role TEXT,
            name TEXT,
            phone TEXT
        )
    `);
    db.run(`
        CREATE TABLE IF NOT EXISTS barbers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT
        )
    `);
    db.run(`
        CREATE TABLE IF NOT EXISTS appointments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT,
            time TEXT,
            barber_id INTEGER,
            client_id INTEGER,
            FOREIGN KEY (barber_id) REFERENCES barbers(id),
            FOREIGN KEY (client_id) REFERENCES users(id)
        )
    `);

    // Insere usuário admin padrão
    db.get('SELECT * FROM users WHERE username = ?', ['admin'], (err, row) => {
        if (err) {
            console.error('Erro ao verificar admin:', err);
        }
        if (!row) {
            db.run(
                'INSERT INTO users (username, password, role, name, phone) VALUES (?, ?, ?, ?, ?)',
                ['admin', 'admin123', 'admin', 'Administrador', '123456789'],
                (err) => {
                    if (err) console.error('Erro ao criar admin:', err);
                    else console.log('Usuário admin criado com sucesso');
                }
            );
        }
    });

    // Insere barbeiros padrão
    db.get('SELECT * FROM barbers WHERE name = ?', ['João Silva'], (err, row) => {
        if (err) {
            console.error('Erro ao verificar barbeiros:', err);
        }
        if (!row) {
            db.run('INSERT INTO barbers (name) VALUES (?)', ['João Silva']);
            db.run('INSERT INTO barbers (name) VALUES (?)', ['Maria Santos']);
        }
    });
});

// Endpoint de login
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    console.log('Tentativa de login:', { username, password });
    db.get(
        'SELECT * FROM users WHERE username = ? AND password = ?',
        [username, password],
        (err, row) => {
            if (err) {
                console.error('Erro no login:', err);
                return res.status(500).json({ error: 'Erro no servidor' });
            }
            if (!row) {
                console.log('Credenciais inválidas para:', username);
                return res.status(401).json({ error: 'Credenciais inválidas' });
            }
            console.log('Usuário encontrado:', row);
            res.json({ id: row.id, role: row.role, username: row.username });
        }
    );
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando em http://localhost:${PORT}`));


// Registro
app.post('/api/register', (req, res) => {
    const { username, password, name, phone } = req.body;
    console.log('Tentativa de registro:', { username, name, phone });
    if (!username || !password) {
        return res.status(400).json({ error: 'Usuário e senha são obrigatórios' });
    }
    db.run(
        'INSERT INTO users (username, password, role, name, phone) VALUES (?, ?, ?, ?, ?)',
        [username, password, 'client', name, phone],
        function (err) {
            if (err) {
                console.error('Erro ao registrar:', err);
                return res.status(400).json({ error: 'Usuário já existe' });
            }
            res.json({ id: this.lastID, role: 'client', username });
        }
    );
});

// Listar usuários (para tabela de clientes no admin)
app.get('/api/users', (req, res) => {
    db.all('SELECT id, username, name, phone FROM users WHERE role = ?', ['client'], (err, rows) => {
        if (err) {
            console.error('Erro ao listar usuários:', err);
            return res.status(500).json({ error: 'Erro no servidor' });
        }
        res.json(rows);
    });
});

// Listar barbeiros
app.get('/api/barbers', (req, res) => {
    db.all('SELECT * FROM barbers', [], (err, rows) => {
        if (err) {
            console.error('Erro ao listar barbeiros:', err);
            return res.status(500).json({ error: 'Erro no servidor' });
        }
        res.json(rows);
    });
});

// Adicionar barbeiro
app.post('/api/barbers', (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Nome do barbeiro é obrigatório' });
    db.run('INSERT INTO barbers (name) VALUES (?)', [name], function (err) {
        if (err) {
            console.error('Erro ao adicionar barbeiro:', err);
            return res.status(500).json({ error: 'Erro no servidor' });
        }
        res.json({ id: this.lastID, name });
    });
});

// Remover barbeiro
app.delete('/api/barbers/:id', (req, res) => {
    const { id } = req.params;
    db.get('SELECT COUNT(*) as count FROM appointments WHERE barber_id = ?', [id], (err, row) => {
        if (err) {
            console.error('Erro ao verificar agendamentos:', err);
            return res.status(500).json({ error: 'Erro no servidor' });
        }
        if (row.count > 0) {
            return res.status(400).json({ error: 'Barbeiro possui agendamentos e não pode ser removido' });
        }
        db.run('DELETE FROM barbers WHERE id = ?', [id], function (err) {
            if (err) {
                console.error('Erro ao remover barbeiro:', err);
                return res.status(500).json({ error: 'Erro no servidor' });
            }
            if (this.changes === 0) {
                return res.status(404).json({ error: 'Barbeiro não encontrado' });
            }
            res.json({ message: 'Barbeiro removido com sucesso' });
        });
    });
});

// Editar barbeiro
app.put('/api/barbers/:id', (req, res) => {
    const { id } = req.params;
    const { name } = req.body;
    if (!name) {
        return res.status(400).json({ error: 'Nome do barbeiro é obrigatório' });
    }
    db.run('UPDATE barbers SET name = ? WHERE id = ?', [name, id], function (err) {
        if (err) {
            console.error('Erro ao editar barbeiro:', err);
            return res.status(500).json({ error: 'Erro no servidor' });
        }
        if (this.changes === 0) {
            return res.status(404).json({ error: 'Barbeiro não encontrado' });
        }
        res.json({ message: 'Barbeiro atualizado com sucesso', id, name });
    });
});

// Listar agendamentos
app.get('/api/appointments', (req, res) => {
    const { barber_id, client_id } = req.query;
    let query = `
        SELECT a.id, a.date, a.time, a.barber_id, a.client_id, b.name AS barber_name, u.name AS client_name
        FROM appointments a
        JOIN barbers b ON a.barber_id = b.id
        JOIN users u ON a.client_id = u.id
    `;
    const params = [];
    if (barber_id && client_id) {
        query += ` WHERE a.barber_id = ? AND a.client_id = ?`;
        params.push(barber_id, client_id);
    } else if (barber_id) {
        query += ` WHERE a.barber_id = ?`;
        params.push(barber_id);
    } else if (client_id) {
        query += ` WHERE a.client_id = ?`;
        params.push(client_id);
    }
    console.log('Executando query:', query, 'com params:', params); // Log para depuração
    db.all(query, params, (err, rows) => {
        if (err) {
            console.error('Erro ao buscar agendamentos:', err);
            return res.status(500).json({ error: 'Erro no servidor' });
        }
        console.log('Agendamentos enviados:', rows);
        res.json(rows);
    });
});
// Criar agendamento
app.post('/api/appointments', (req, res) => {
    const { date, time, barber_id, client_id } = req.body;
    if (!date || !time || !barber_id || !client_id) {
        return res.status(400).json({ error: 'Data, horário, barbeiro e cliente são obrigatórios' });
    }
    // Verifica se o horário já está ocupado
    db.get(
        'SELECT * FROM appointments WHERE date = ? AND time = ? AND barber_id = ?',
        [date, time, barber_id],
        (err, row) => {
            if (err) {
                console.error('Erro ao verificar agendamento:', err);
                return res.status(500).json({ error: 'Erro no servidor' });
            }
            if (row) {
                return res.status(400).json({ error: 'Horário já está ocupado' });
            }
            db.run(
                'INSERT INTO appointments (date, time, barber_id, client_id) VALUES (?, ?, ?, ?)',
                [date, time, barber_id, client_id],
                function (err) {
                    if (err) {
                        console.error('Erro ao criar agendamento:', err);
                        return res.status(500).json({ error: 'Erro no servidor' });
                    }
                    res.json({ id: this.lastID, date, time, barber_id, client_id });
                }
            );
        }
    );
});
// Remover agendamento
app.delete('/api/appointments/:id', (req, res) => {
    const { id } = req.params;
    db.run('DELETE FROM appointments WHERE id = ?', [id], function (err) {
        if (err) {
            console.error('Erro ao remover agendamento:', err);
            return res.status(500).json({ error: 'Erro no servidor' });
        }
        if (this.changes === 0) {
            return res.status(404).json({ error: 'Agendamento não encontrado' });
        }
        res.json({ message: 'Agendamento removido com sucesso' });
    });
});

app.listen(3000, () => console.log('Servidor rodando em http://localhost:3000'));