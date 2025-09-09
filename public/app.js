let user = null;

// Funções para mostrar/esconder seções
function showLogin() {
    document.getElementById('login-section').style.display = 'block';
    document.getElementById('register-section').style.display = 'none';
    document.getElementById('client-section').style.display = 'none';
    document.getElementById('admin-section').style.display = 'none';
}

function showRegister() {
    document.getElementById('login-section').style.display = 'none';
    document.getElementById('register-section').style.display = 'block';
    document.getElementById('client-section').style.display = 'none';
    document.getElementById('admin-section').style.display = 'none';
}

function showClientPanel() {
    document.getElementById('login-section').style.display = 'none';
    document.getElementById('register-section').style.display = 'none';
    document.getElementById('client-section').style.display = 'block';
    document.getElementById('admin-section').style.display = 'none';
    document.getElementById('client-username').textContent = user.username;
    loadBarbersForClient();
    initializeClientCalendar();
}

async function showAdminPanel() {
    const adminSection = document.getElementById('admin-section');
    if (!adminSection) {
        console.error('Elemento admin-section não encontrado no DOM');
        alert('Erro: Painel do administrador não encontrado');
        return;
    }
    document.getElementById('login-section').style.display = 'none';
    document.getElementById('register-section').style.display = 'none';
    document.getElementById('client-section').style.display = 'none';
    adminSection.style.display = 'block';
    await loadBarbersForAdmin();
    await loadClients();
    initializeAdminCalendar();
}

// Função de login
async function login() {
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;
    console.log('Enviando para o backend:', { username, password });
    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await response.json();
        console.log('Resposta do backend:', data);
        if (data.error) {
            alert(data.error);
            return;
        }
        user = data;
        if (data.role === 'client') {
            showClientPanel();
        } else {
            showAdminPanel();
        }
    } catch (error) {
        console.error('Erro no login:', error);
        alert('Erro ao tentar logar');
    }
}

// Função de registro
async function register() {
    const username = document.getElementById('register-username').value;
    const password = document.getElementById('register-password').value;
    const name = document.getElementById('register-name').value;
    const phone = document.getElementById('register-phone').value;
    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, name, phone })
        });
        const data = await response.json();
        if (data.error) {
            alert(data.error);
            return;
        }
        alert('Usuário registrado com sucesso');
        showLogin();
    } catch (error) {
        console.error('Erro no registro:', error);
        alert('Erro ao tentar registrar');
    }
}

// Função de logout
function logout() {
    user = null;
    showLogin();
}

// Carrega barbeiros para o cliente
async function loadBarbersForClient() {
    try {
        const response = await fetch('/api/barbers');
        const barbers = await response.json();
        const select = document.getElementById('barber-select');
        select.innerHTML = '<option value="">Selecione um barbeiro</option>';
        barbers.forEach(barber => {
            const option = document.createElement('option');
            option.value = barber.id;
            option.textContent = barber.name;
            select.appendChild(option);
        });
        // Recarrega agendamentos quando o barbeiro é selecionado
        select.onchange = () => initializeClientCalendar();
    } catch (error) {
        console.error('Erro ao carregar barbeiros:', error);
        alert('Erro ao carregar barbeiros');
    }
}

// Carrega barbeiros e clientes para o admin
async function loadBarbersForAdmin() {
    try {
        // Carrega barbeiros
        const barberResponse = await fetch('/api/barbers');
        const barbers = await barberResponse.json();
        const tableBody = document.querySelector('#admin-section table#barbers-table tbody');
        tableBody.innerHTML = '';
        barbers.forEach(barber => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${barber.id}</td>
                <td>${barber.name}</td>
                <td>
                    <button onclick="editBarber(${barber.id}, '${barber.name.replace(/'/g, "\\'")}')">Editar</button>
                    <button onclick="deleteBarber(${barber.id})">Remover</button>
                </td>
            `;
            tableBody.appendChild(row);
        });
        // Carrega barbeiros no select
        const adminBarberSelect = document.getElementById('admin-barber-select');
        if (!adminBarberSelect) {
            console.error('Elemento admin-barber-select não encontrado');
            alert('Erro: Seletor de barbeiros não encontrado');
            return;
        }
        adminBarberSelect.innerHTML = '<option value="">Todos os barbeiros</option>';
        barbers.forEach(barber => {
            const option = document.createElement('option');
            option.value = barber.id;
            option.textContent = barber.name;
            adminBarberSelect.appendChild(option);
        });
        // Carrega clientes no select
        const clientResponse = await fetch('/api/users');
        const clients = await clientResponse.json();
        const adminClientSelect = document.getElementById('admin-client-select');
        adminClientSelect.innerHTML = '<option value="">Selecione um cliente</option>';
        clients.forEach(client => {
            const option = document.createElement('option');
            option.value = client.id;
            option.textContent = `${client.username} (${client.name || 'Sem nome'})`;
            adminClientSelect.appendChild(option);
        });
    } catch (error) {
        console.error('Erro ao carregar barbeiros ou clientes:', error);
        alert('Erro ao carregar barbeiros ou clientes');
    }
}
// Adiciona um barbeiro
async function addBarber() {
    const name = document.getElementById('barber-name').value;
    if (!name) return alert('Nome do barbeiro é obrigatório');
    try {
        const response = await fetch('/api/barbers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
        const data = await response.json();
        if (data.error) return alert(data.error);
        document.getElementById('barber-name').value = '';
        await loadBarbersForAdmin();
    } catch (error) {
        console.error('Erro ao adicionar barbeiro:', error);
        alert('Erro ao adicionar barbeiro');
    }
}

// Edita um barbeiro
async function editBarber(id, currentName) {
    const name = prompt('Editar nome do barbeiro:', currentName);
    if (!name) return alert('Nome do barbeiro é obrigatório');
    try {
        const response = await fetch(`/api/barbers/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
        const data = await response.json();
        if (data.error) return alert(data.error);
        alert('Barbeiro atualizado com sucesso');
        await loadBarbersForAdmin();
    } catch (error) {
        console.error('Erro ao editar barbeiro:', error);
        alert('Erro ao editar barbeiro');
    }
}

// Remove um barbeiro
async function deleteBarber(id) {
    if (!confirm('Tem certeza que deseja remover este barbeiro?')) return;
    try {
        const response = await fetch(`/api/barbers/${id}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await response.json();
        if (data.error) return alert(data.error);
        alert('Barbeiro removido com sucesso');
        await loadBarbersForAdmin();
    } catch (error) {
        console.error('Erro ao remover barbeiro:', error);
        alert('Erro ao remover barbeiro');
    }
}

// Carrega clientes para a tabela do admin
async function loadClients() {
    try {
        const response = await fetch('/api/users');
        const users = await response.json();
        const tableBody = document.querySelector('#clients-table tbody');
        tableBody.innerHTML = '';
        users.forEach(user => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${user.id}</td>
                <td>${user.username}</td>
                <td>${user.name || ''}</td>
                <td>${user.phone || ''}</td>
            `;
            tableBody.appendChild(row);
        });
    } catch (error) {
        console.error('Erro ao carregar clientes:', error);
        alert('Erro ao carregar clientes');
    }
}

// Carrega agendamentos
function addMinutes(time, minutes) {
    const [hours, mins] = time.split(':').map(Number);
    const date = new Date(0, 0, 0, hours, mins + minutes);
    return date.toTimeString().slice(0, 5);
}
async function loadAppointments(barberId, isAdmin = false) {
    try {
        let url = '/api/appointments';
        if (!isAdmin && user) {
            url += `?client_id=${user.id}${barberId ? `&barber_id=${barberId}` : ''}`;
        } else if (barberId) {
            url += `?barber_id=${barberId}`;
        }
        console.log('Carregando agendamentos da URL:', url); // Log para depuração
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Erro HTTP ${response.status}: ${response.statusText}`);
        }
        const appointments = await response.json();
        console.log('Agendamentos recebidos:', appointments); // Log para verificar dados
        return appointments.map(appointment => ({
            title: `Agendamento com ${appointment.barber_name}${isAdmin ? ` (${appointment.client_name})` : ''}`,
            start: `${appointment.date}T${appointment.time}`,
            end: `${appointment.date}T${addMinutes(appointment.time, 30)}`, // Duração de 30 minutos
            id: appointment.id,
            backgroundColor: 'red', // Vermelho para horários ocupados
            borderColor: 'red',
            textColor: 'white', // Texto branco para legibilidade
            className: 'occupied' // Classe CSS para estilo adicional
        }));
    } catch (error) {
        console.error('Erro ao carregar agendamentos:', error);
        alert('Erro ao carregar agendamentos');
        return [];
    }
}

async function initializeClientCalendar() {
    const calendarEl = document.getElementById('calendar');
    const barberSelect = document.getElementById('barber-select');
    const barberId = barberSelect.value;
    const calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'timeGridWeek',
        slotMinTime: '08:00:00',
        slotMaxTime: '20:00:00',
        slotDuration: '00:30:00',
        selectable: true,
        selectOverlap: false, // Impede seleção em horários ocupados
        events: async (info, successCallback, failureCallback) => {
            const barberId = barberSelect.value;
            const events = await loadAppointments(barberId, false);
            successCallback(events);
        },
        select: async function (info) {
            const barberId = barberSelect.value;
            if (!barberId) {
                alert('Selecione um barbeiro antes de escolher um horário');
                return;
            }
            const date = info.startStr.split('T')[0];
            const time = info.startStr.split('T')[1].substring(0, 5);
            if (confirm(`Deseja agendar com o barbeiro no dia ${date} às ${time}?`)) {
                try {
                    const response = await fetch('/api/appointments', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ date, time, barber_id: barberId, client_id: user.id })
                    });
                    const data = await response.json();
                    if (data.error) {
                        alert(data.error);
                        return;
                    }
                    alert('Agendamento realizado com sucesso');
                    calendar.refetchEvents();
                } catch (error) {
                    console.error('Erro ao criar agendamento:', error);
                    alert('Erro ao criar agendamento');
                }
            }
        },
        eventClick: function (info) {
            alert('Este horário já está ocupado');
            info.jsEvent.preventDefault(); // Impede ações em eventos ocupados
        }
    });
    calendar.render();
    // Atualiza eventos quando o barbeiro é selecionado
    barberSelect.addEventListener('change', () => calendar.refetchEvents());
}

// Inicializa o calendário do admin
async function initializeAdminCalendar() {
    const calendarEl = document.getElementById('admin-calendar');
    const barberSelect = document.getElementById('admin-barber-select');
    if (!calendarEl || !barberSelect) {
        console.error('Elementos admin-calendar ou admin-barber-select não encontrados');
        alert('Erro: Elementos do calendário não encontrados');
        return;
    }
    const calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'timeGridWeek',
        slotMinTime: '08:00:00',
        slotMaxTime: '20:00:00',
        slotDuration: '00:30:00',
        events: async function(fetchInfo, successCallback, failureCallback) {
            try {
                const barberId = barberSelect.value;
                const events = await loadAppointments(barberId, true);
                successCallback(events);
            } catch (error) {
                console.error('Erro ao carregar eventos:', error);
                failureCallback(error);
            }
        },
        eventClick: async function (info) {
            if (confirm(`Deseja remover o agendamento ID ${info.event.id}?`)) {
                try {
                    const response = await fetch(`/api/appointments/${info.event.id}`, {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json' }
                    });
                    const data = await response.json();
                    if (data.error) {
                        alert(data.error);
                        return;
                    }
                    alert('Agendamento removido com sucesso');
                    info.event.remove();
                } catch (error) {
                    console.error('Erro ao remover agendamento:', error);
                    alert('Erro ao remover agendamento');
                }
            }
        }
        
    });
    calendar.render();
    
    // Recarrega agendamentos quando o barbeiro é selecionado
    barberSelect.addEventListener('change', () => {
        calendar.refetchEvents();
    });
}
    // Carrega agendamentos
let calendar; // Calendário do cliente


// Carregar agendamentos para o cliente
async function loadAppointments(barberId) {
    try {
        const response = await fetch(`/api/appointments?barber_id=${barberId}`);
        const appointments = await response.json();
        if (!response.ok) {
            throw new Error(appointments.error || 'Erro ao carregar agendamentos');
        }
        currentBarberId = barberId;
        const calendarEl = document.getElementById('calendar');

        // Inicializar o calendário se não existir
        if (!calendar && calendarEl) {
            calendar = new FullCalendar.Calendar(calendarEl, {
                initialView: 'timeGridWeek',
                slotMinTime: '08:00:00',
                slotMaxTime: '20:00:00',
                slotDuration: '00:30:00',
                allDaySlot: false,
                events: appointments.map(appointment => ({
                    title: 'Ocupado',
                    start: `${appointment.date}T${appointment.time}`,
                    backgroundColor: 'red',
                    borderColor: 'red',
                    textColor: 'white',
                    editable: false,
                    classNames: ['occupied']
                })),
                eventClick: function(info) {
                    alert(`Horário ocupado: ${info.event.start.toLocaleString('pt-BR')}`);
                },
                dateClick: async function(info) {
                    const date = info.dateStr.split('T')[0];
                    const time = info.dateStr.split('T')[1].substring(0, 5);
                    const isAvailable = await checkAppointmentAvailability(barberId, date, time);
                    if (!isAvailable) {
                        alert('Horário já ocupado. Escolha outro horário.');
                        return;
                    }
                    const clientId = user.id; // Usa user.id do login
                    if (!clientId) {
                        alert('Faça login para agendar');
                        return;
                    }
                    createAppointment(date, time, barberId, clientId);
                }
            });
            calendar.render();
        } else if (calendar && typeof calendar.getEvents === 'function') {
            // Atualizar eventos se o calendário já existe
            calendar.getEvents().forEach(event => event.remove());
            appointments.forEach(appointment => {
                calendar.addEvent({
                    title: 'Ocupado',
                    start: `${appointment.date}T${appointment.time}`,
                    backgroundColor: 'red',
                    borderColor: 'red',
                    textColor: 'white',
                    editable: false,
                    classNames: ['occupied']
                });
            });
            calendar.render(); // Força re-renderização
        } else {
            console.warn('Calendário não inicializado ou getEvents não disponível');
            return;
        }
        updateTimeSelect(); // Atualiza o select de horários
        console.log('Agendamentos do cliente carregados:', appointments);
    } catch (error) {
        console.error('Erro ao carregar agendamentos:', error);
        alert('Erro ao carregar agendamentos: ' + error.message);
    }
}

// Verificar disponibilidade de horário
async function checkAppointmentAvailability(barberId, date, time) {
    try {
        // Validar parâmetros
        if (!barberId || !date || !time || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
            console.error('Parâmetros inválidos:', { barberId, date, time });
            alert('Selecione um barbeiro, data e horário válidos.');
            return false;
        }

        const response = await fetch(`/api/appointments/check?barber_id=${barberId}&date=${date}&time=${time}`);
        const data = await response.json();
        if (!response.ok) {
            console.error('Erro na resposta do servidor:', response.status, data.error || 'Sem mensagem de erro');
            throw new Error(data.error || 'Erro no servidor');
        }
        return !data.isBooked;
    } catch (error) {
        console.error('Erro ao verificar horário:', error.message, { barberId, date, time });
        alert('Erro ao verificar horário. Verifique se selecionou um barbeiro e tente novamente.');
        return false;
    }
}
// Criar agendamento
async function createAppointment(date, time, barberId, clientId) {
    try {
        const response = await fetch('/api/appointments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date, time, barber_id: barberId, client_id: clientId })
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'Erro ao criar agendamento');
        }
        alert(data.message);
        loadAppointments(barberId); // Recarrega o calendário e o select de horários
    } catch (error) {
        console.error('Erro ao criar agendamento:', error);
        alert('Erro ao criar agendamento: ' + error.message);
    }
}

// Atualizar o select de horários disponíveis
async function updateTimeSelect() {
    const dateSelect = document.getElementById('date-select');
    const timeSelect = document.getElementById('time-select');
    const selectedDate = dateSelect.value;
    const barberId = currentBarberId;

    if (!selectedDate || !barberId) {
        timeSelect.innerHTML = '<option value="">Selecione uma data primeiro</option>';
        return;
    }

    const timeSlots = [];
    for (let hour = 8; hour < 18; hour++) {
        timeSlots.push(`${hour.toString().padStart(2, '0')}:00`);
        timeSlots.push(`${hour.toString().padStart(2, '0')}:30`);
    }

    timeSelect.innerHTML = '<option value="">Selecione um horário</option>';
    for (const time of timeSlots) {
        const response = await fetch(`/api/appointments/check?barber_id=${barberId}&date=${selectedDate}&time=${time}`);
        const data = await response.json();
        if (!response.ok) {
            console.error('Erro ao verificar horário:', data.error);
            continue;
        }
        if (!data.isBooked) {
            const option = document.createElement('option');
            option.value = time;
            option.textContent = time;
            timeSelect.appendChild(option);
        }
    }
}

// Carregar datas disponíveis (próximos 7 dias)
function loadDates() {
    const dateSelect = document.getElementById('date-select');
    if (dateSelect) {
        dateSelect.innerHTML = '<option value="">Selecione uma data</option>';
        const today = new Date();
        for (let i = 0; i < 7; i++) {
            const date = new Date(today);
            date.setDate(today.getDate() + i);
            const dateStr = date.toISOString().split('T')[0];
            const option = document.createElement('option');
            option.value = dateStr;
            option.textContent = date.toLocaleDateString('pt-BR');
            dateSelect.appendChild(option);
        }
    }
}

// Configurar eventos do DOM (apenas no painel do cliente)
if (document.getElementById('client-section')) {
    document.addEventListener('DOMContentLoaded', function() {
        const barberSelect = document.getElementById('barber-select');
        const dateSelect = document.getElementById('date-select');
        const timeSelect = document.getElementById('time-select');
        const bookButton = document.getElementById('book-appointment');

        // Carregar barbeiros
        async function loadBarbers() {
            try {
                const response = await fetch('/api/barbers');
                const barbers = await response.json();
                if (!response.ok) {
                    throw new Error(barbers.error || 'Erro ao carregar barbeiros');
                }
                barberSelect.innerHTML = '<option value="">Selecione um barbeiro</option>';
                barbers.forEach(barber => {
                    const option = document.createElement('option');
                    option.value = barber.id;
                    option.textContent = barber.name;
                    barberSelect.appendChild(option);
                });
            } catch (error) {
                console.error('Erro ao carregar barbeiros:', error);
                alert('Erro ao carregar barbeiros: ' + error.message);
            }
        }

        // Evento de mudança no barbeiro
        barberSelect.addEventListener('change', function() {
            const barberId = this.value;
            if (barberId) {
                loadAppointments(barberId);
            } else {
                if (calendar && typeof calendar.getEvents === 'function') {
                    calendar.getEvents().forEach(event => event.remove());
                    calendar.destroy();
                    calendar = null;
                }
                dateSelect.innerHTML = '<option value="">Selecione um barbeiro primeiro</option>';
                timeSelect.innerHTML = '<option value="">Selecione uma data primeiro</option>';
            }
        });

        // Evento de mudança na data
        if (dateSelect) {
            dateSelect.addEventListener('change', function() {
                updateTimeSelect();
            });
        }

        // Evento de clique no botão de agendamento
        if (bookButton) {
            bookButton.addEventListener('click', async function() {
                const barberId = barberSelect.value;
                const date = dateSelect.value;
                const time = timeSelect.value;
                const clientId = user.id; // Usa user.id do login
                if (!barberId || !date || !time || !clientId) {
                    alert('Selecione barbeiro, data, horário e faça login');
                    return;
                }
                const isAvailable = await checkAppointmentAvailability(barberId, date, time);
                if (!isAvailable) {
                    alert('Horário já ocupado. Escolha outro horário.');
                    return;
                }
                createAppointment(date, time, barberId, clientId);
            });
        }

        // Inicializar
        loadBarbers();
        loadDates();
    });
}
let calendarAdmin; // Calendário do administrador
let currentBarberId = null; // ID do barbeiro selecionado

// Carregar agendamentos para o administrador
async function loadAppointmentsAdmin(barberId) {
    try {
        const response = await fetch(`/api/appointments?barber_id=${barberId}`);
        const appointments = await response.json();
        if (!response.ok) {
            throw new Error(appointments.error || 'Erro ao carregar agendamentos');
        }
        currentBarberId = barberId; // Armazena o barbeiro atual
        // Inicializar o calendário apenas na primeira vez
        if (!calendarAdmin) {
            const calendarEl = document.getElementById('calendar-admin');
            calendarAdmin = new FullCalendar.Calendar(calendarEl, {
                initialView: 'timeGridWeek',
                slotMinTime: '08:00:00',
                slotMaxTime: '19:00:00',
                slotDuration: '00:30:00',
                allDaySlot: false,
                events: appointments.map(appointment => ({
                    title: `${appointment.client_name} - ${appointment.barber_name}`,
                    start: `${appointment.date}T${appointment.time}`,
                    backgroundColor: 'red',
                    borderColor: 'red',
                    textColor: 'white',
                    editable: false
                })),
                eventClick: function(info) {
                    alert(`Agendamento: ${info.event.title} em ${info.event.start.toLocaleString()}`);
                }
            });
            calendarAdmin.render();
        } else {
            // Atualizar eventos sem recriar o calendário
            calendarAdmin.getEvents().forEach(event => event.remove());
            appointments.forEach(appointment => {
                calendarAdmin.addEvent({
                    title: `${appointment.client_name} - ${appointment.barber_name}`,
                    start: `${appointment.date}T${appointment.time}`,
                    backgroundColor: 'red',
                    borderColor: 'red',
                    textColor: 'white',
                    editable: false
                });
            });
        }
        console.log('Agendamentos do administrador carregados:', appointments);
    } catch (error) {
        console.error('Erro ao carregar agendamentos do administrador:', error);
        alert('Erro ao carregar agendamentos: ' + error.message);
    }
}

// Alternar visão do calendário
function changeCalendarView(view) {
    if (calendarAdmin) {
        calendarAdmin.changeView(view); // Muda a visão (timeGridWeek ou timeGridDay)
        console.log('Visão alterada para:', view);
    } else {
        console.warn('Calendário não inicializado');
    }
}

// Configurar eventos do DOM
document.addEventListener('DOMContentLoaded', function() {
    const barberSelect = document.getElementById('barber-select');
    const viewSelect = document.getElementById('calendar-view');

    // Carregar barbeiros (supondo que já existe no seu código)
    async function loadBarbers() {
        try {
            const response = await fetch('/api/barbers');
            const barbers = await response.json();
            if (!response.ok) {
                throw new Error(barbers.error || 'Erro ao carregar barbeiros');
            }
            barberSelect.innerHTML = '<option value="">Selecione um barbeiro</option>';
            barbers.forEach(barber => {
                const option = document.createElement('option');
                option.value = barber.id;
                option.textContent = barber.name;
                barberSelect.appendChild(option);
            });
        } catch (error) {
            console.error('Erro ao carregar barbeiros:', error);
            alert('Erro ao carregar barbeiros: ' + error.message);
        }
    }

    // Evento de mudança no barbeiro
    barberSelect.addEventListener('change', function() {
        const barberId = this.value;
        if (barberId) {
            loadAppointmentsAdmin(barberId);
        } else {
            if (calendarAdmin) {
                calendarAdmin.getEvents().forEach(event => event.remove());
                calendarAdmin.destroy();
                calendarAdmin = null;
            }
        }
    });

    // Evento de mudança na visão
    viewSelect.addEventListener('change', function() {
        const view = this.value;
        changeCalendarView(view);
    });

    // Inicializar
    loadBarbers();
});


// Marca um agendamento pelo admin
async function createAdminAppointment() {
    const clientId = document.getElementById('admin-client-select').value;
    const barberId = document.getElementById('admin-barber-select').value;
    const date = document.getElementById('admin-appointment-date').value;
    const time = document.getElementById('admin-appointment-time').value;
    if (!clientId || !barberId || !date || !time) {
        alert('Todos os campos são obrigatórios');
        return;
    }
    try {
        const response = await fetch('/api/appointments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date, time, barber_id: barberId, client_id: clientId })
        });
        const data = await response.json();
        if (data.error) {
            alert(data.error);
            return;
        }
        alert('Agendamento marcado com sucesso');
        document.getElementById('admin-appointment-date').value = '';
        document.getElementById('admin-appointment-time').value = '';
        document.getElementById('admin-client-select').value = '';
        document.getElementById('admin-barber-select').value = '';
        const calendar = document.getElementById('admin-calendar')._calendarApi;
        if (calendar) {
            calendar.getEventSources().forEach(source => source.remove());
            loadAppointments(barberSelect.value, true).then(events => calendar.addEventSource(events));
        }
    } catch (error) {
        console.error('Erro ao marcar agendamento:', error);
        alert('Erro ao marcar agendamento');
    }
}
// Evento de mudança na visão
    viewSelect.addEventListener('change', function() {
        const view = this.value;
        changeCalendarView(view);
    });

// Inicializa a aplicação
showLogin();

// Calendário do cliente
function initClientCalendar() {
    const calendarEl = document.getElementById('calendar');
    const calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'timeGridWeek',
        slotMinTime: '09:00:00',
        slotMaxTime: '19:00:00',
        allDaySlot: false,
        events: async (info, successCallback) => {
            const barberId = document.getElementById('barber-select').value;
            if (!barberId) return successCallback([]);
            const date = info.startStr.split('T')[0];
            const response = await fetch(`/api/appointments?date=${date}&userId=${user.id}&userRole=${user.role}`);
            const { appointments, timeSlots } = await response.json();
            const events = timeSlots.map(time => {
                const isBooked = appointments.some(a => a.time === time && a.barberId == barberId);
                return {
                    title: isBooked ? 'Indisponível' : 'Disponível',
                    start: `${date}T${time}`,
                    backgroundColor: isBooked ? '#ff0000' : '#00ff00',
                    borderColor: isBooked ? '#ff0000' : '#00ff00',
                    editable: false
                };
            });
            successCallback(events);
        },
        dateClick: async (info) => {
            const barberId = document.getElementById('barber-select').value;
            if (!barberId) return alert('Selecione um barbeiro');
            const date = info.dateStr.split('T')[0];
            const time = info.dateStr.split('T')[1].substring(0, 5);
            const response = await fetch('/api/appointments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ date, time, barberId, userId: user.id })
            });
            const data = await response.json();
            if (data.error) return alert(data.error);
            calendar.refetchEvents();
        }
    });
    calendar.render();
}

// Calendário do admin
function initAdminCalendar() {
    const calendarEl = document.getElementById('admin-calendar');
    const calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'timeGridWeek',
        slotMinTime: '09:00:00',
        slotMaxTime: '19:00:00',
        allDaySlot: false,
        events: async (info) => {
            const barberId = document.getElementById('admin-barber-select').value;
            if (!barberId) return [];
            const date = info.startStr.split('T')[0];
            const response = await fetch(`/api/appointments?date=${date}&userId=${user.id}&userRole=${user.role}`);
            const { appointments } = await response.json();
            return appointments.map(a => ({
                title: `${a.barberName} - ${a.clientName}`,
                start: `${a.date}T${a.time}`,
                backgroundColor: '#d4af37',
                borderColor: '#d4af37'
            }));
        }
    });
    calendar.render();
    document.getElementById('admin-barber-select').addEventListener('change', () => calendar.refetchEvents());
}