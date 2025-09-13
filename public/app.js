let user = null;
let clientCalendar = null;
let adminCalendar = null;
let currentBarberId = null;

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
    clientCalendar = null;
    adminCalendar = null;
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
        if (tableBody) {
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
        }
    } catch (error) {
        console.error('Erro ao carregar clientes:', error);
        alert('Erro ao carregar clientes');
    }
}

function addMinutes(time, minutes) {
    const [hours, mins] = time.split(':').map(Number);
    const date = new Date(0, 0, 0, hours, mins + minutes);
    return date.toTimeString().slice(0, 5);
}

async function loadAppointments(barberId, isAdmin = false) {
    try {
        let url = `/api/appointments?barber_id=${barberId}&isAdmin=${isAdmin}`;
        
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Erro HTTP ${response.status}: ${response.statusText}`);
        }
        
        const appointments = await response.json();
        return appointments.map(appointment => ({
            title: isAdmin ? 
                `${appointment.barber_name} - ${appointment.client_name}` : 
                'Horário Ocupado',
            start: `${appointment.date}T${appointment.time}`,
            end: `${appointment.date}T${addMinutes(appointment.time, 30)}`,
            id: appointment.id,
            backgroundColor: 'red',
            borderColor: 'red',
            textColor: 'white',
            className: 'occupied',
            extendedProps: {
                barberName: appointment.barber_name,
                clientName: appointment.client_name,
                clientPhone: appointment.client_phone,
                appointmentId: appointment.id
            }
        }));
    } catch (error) {
        console.error('Erro ao carregar agendamentos:', error);
        alert('Erro ao carregar agendamentos');
        return [];
    }
}

async function checkAppointmentAvailability(barberId, date, time) {
    try {
        const isAdmin = user && user.role === 'admin';
        const response = await fetch(
            `/api/appointments/check?barber_id=${barberId}&date=${date}&time=${time}&isAdmin=${isAdmin}`
        );
        const data = await response.json();
        return !data.isBooked;
    } catch (error) {
        console.error('Erro ao verificar disponibilidade:', error);
        return false;
    }
}

// Função para carregar horários ocupados (apenas horários, sem informações)
async function loadOccupiedTimes(barberId, date) {
    try {
        const response = await fetch(
            `/api/appointments/simple?barber_id=${barberId}&date=${date}`
        );
        if (response.ok) {
            return await response.json();
        }
        return [];
    } catch (error) {
        console.error('Erro ao carregar horários ocupados:', error);
        return [];
    }
}

// Atualizar a função updateTimeSelect
async function updateTimeSelect() {
    const dateSelect = document.getElementById('date-select');
    const timeSelect = document.getElementById('time-select');
    const barberSelect = document.getElementById('barber-select');
    
    const selectedDate = dateSelect.value;
    const barberId = barberSelect.value;

    if (!selectedDate || !barberId) {
        timeSelect.innerHTML = '<option value="">Selecione data e barbeiro</option>';
        return;
    }

    try {
        timeSelect.innerHTML = '<option value="">Carregando...</option>';
        
        // Carregar horários ocupados
        const occupiedTimes = await loadOccupiedTimes(barberId, selectedDate);
        
        // Gerar todos os horários possíveis
        const timeSlots = [];
        for (let hour = 8; hour < 20; hour++) {
            timeSlots.push(`${hour.toString().padStart(2, '0')}:00`);
            timeSlots.push(`${hour.toString().padStart(2, '0')}:30`);
        }

        // Filtrar horários disponíveis
        timeSelect.innerHTML = '<option value="">Selecione um horário</option>';
        for (const time of timeSlots) {
            if (!occupiedTimes.includes(time)) {
                const option = document.createElement('option');
                option.value = time;
                option.textContent = time;
                timeSelect.appendChild(option);
            }
        }
    } catch (error) {
        console.error('Erro ao carregar horários:', error);
        timeSelect.innerHTML = '<option value="">Erro ao carregar</option>';
    }
}
// Inicializa o calendário do cliente
async function initializeClientCalendar() {
    const calendarEl = document.getElementById('calendar');
    if (!calendarEl) {
        console.error('Elemento calendar não encontrado');
        return;
    }

    if (clientCalendar) {
        clientCalendar.destroy();
    }

    const barberSelect = document.getElementById('barber-select');
    
    clientCalendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'timeGridWeek',
        slotMinTime: '08:00:00',
        slotMaxTime: '20:00:00',
        slotDuration: '00:30:00',
        selectable: true,
        selectOverlap: false,
         // CONFIGURAÇÕES RESPONSIVAS
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'timeGridDay,timeGridWeek'
        },
        
        // Melhorias para mobile
        allDaySlot: false,
        dayMaxEvents: true,
        height: 'auto',
        contentHeight: 'auto',
        
        // Ajustes de visualização mobile
        views: {
            timeGridWeek: {
                slotLabelFormat: {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false
                },
                dayHeaderFormat: { weekday: 'short', day: 'numeric' }
            },
            timeGridDay: {
                slotLabelFormat: {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false
                }
            }
        },
        events: async (info, successCallback) => {
            const barberId = barberSelect.value;
            if (!barberId) {
                successCallback([]);
                return;
            }
            const events = await loadAppointments(barberId, false);
            successCallback(events);
        },
        select: async function(info) {
            const barberId = barberSelect.value;
            if (!barberId) {
                alert('Selecione um barbeiro antes de escolher um horário');
                clientCalendar.unselect();
                return;
            }
            
            const date = info.startStr.split('T')[0];
            const time = info.startStr.split('T')[1].substring(0, 5);
            
            // Verificar se o horário já está ocupado
            const isAvailable = await checkAppointmentAvailability(barberId, date, time);
            if (!isAvailable) {
                alert('Este horário já está ocupado. Por favor, escolha outro horário.');
                clientCalendar.unselect();
                return;
            }
            
            if (confirm(`Deseja agendar com o barbeiro no dia ${date} às ${time}?`)) {
                try {
                    const response = await fetch('/api/appointments', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                            date, 
                            time, 
                            barber_id: barberId, 
                            client_id: user.id 
                        })
                    });
                    
                    const data = await response.json();
                    if (data.error) {
                        alert(data.error);
                        return;
                    }
                    
                    alert('Agendamento realizado com sucesso');
                    clientCalendar.refetchEvents();
                    loadDates(); // Recarrega as datas disponíveis
                } catch (error) {
                    console.error('Erro ao criar agendamento:', error);
                    alert('Erro ao criar agendamento');
                }
            }
            clientCalendar.unselect();
        },
        eventClick: function(info) {
            const { barberName, clientName } = info.event.extendedProps;
            alert(`Horário Ocupado\nBarbeiro: ${barberName}\nCliente: ${clientName}`);
        }
    });
    
    clientCalendar.render();
    
    // Configurar o select de barbeiro para recarregar o calendário
    barberSelect.addEventListener('change', () => {
        if (clientCalendar) {
            clientCalendar.refetchEvents();
        }
        loadDates(); // Carrega datas quando muda o barbeiro
    });

    // Inicializar selects de data e hora
    loadDates();
    setupAppointmentBooking();
}

// Verificar disponibilidade de horário
async function checkAppointmentAvailability(barberId, date, time) {
    try {
        const response = await fetch(`/api/appointments/check?barber_id=${barberId}&date=${date}&time=${time}`);
        const data = await response.json();
        return !data.isBooked;
    } catch (error) {
        console.error('Erro ao verificar disponibilidade:', error);
        return false;
    }
}

// Configurar agendamento via select
function setupAppointmentBooking() {
    const bookButton = document.getElementById('book-appointment');
    if (bookButton) {
        bookButton.onclick = async function() {
            const barberId = document.getElementById('barber-select').value;
            const date = document.getElementById('date-select').value;
            const time = document.getElementById('time-select').value;
            
            if (!barberId || !date || !time) {
                alert('Por favor, selecione barbeiro, data e horário');
                return;
            }

            const isAvailable = await checkAppointmentAvailability(barberId, date, time);
            if (!isAvailable) {
                alert('Este horário já está ocupado. Por favor, escolha outro horário.');
                return;
            }

            if (confirm(`Confirmar agendamento para ${date} às ${time}?`)) {
                try {
                    const response = await fetch('/api/appointments', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                            date, 
                            time, 
                            barber_id: barberId, 
                            client_id: user.id 
                        })
                    });
                    
                    const data = await response.json();
                    if (data.error) {
                        alert(data.error);
                        return;
                    }
                    
                    alert('Agendamento realizado com sucesso!');
                    if (clientCalendar) {
                        clientCalendar.refetchEvents();
                    }
                    loadDates(); // Recarrega as datas
                } catch (error) {
                    console.error('Erro ao criar agendamento:', error);
                    alert('Erro ao criar agendamento');
                }
            }
        };
    }
}

// Carregar datas disponíveis
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
        
        // Quando a data muda, carregar horários disponíveis
        dateSelect.onchange = updateTimeSelect;
    }
}

// Atualizar select de horários
async function updateTimeSelect() {
    const dateSelect = document.getElementById('date-select');
    const timeSelect = document.getElementById('time-select');
    const barberSelect = document.getElementById('barber-select');
    
    const selectedDate = dateSelect.value;
    const barberId = barberSelect.value;

    if (!selectedDate || !barberId) {
        timeSelect.innerHTML = '<option value="">Selecione data e barbeiro</option>';
        return;
    }

    try {
        timeSelect.innerHTML = '<option value="">Carregando...</option>';
        
        // Primeiro, carregar todos os agendamentos do barbeiro na data selecionada
        const appointmentsResponse = await fetch(`/api/appointments?barber_id=${barberId}&date=${selectedDate}`);
        const appointments = await appointmentsResponse.json();
        
        // Gerar todos os horários possíveis
        const timeSlots = [];
        for (let hour = 8; hour < 20; hour++) {
            timeSlots.push(`${hour.toString().padStart(2, '0')}:00`);
            timeSlots.push(`${hour.toString().padStart(2, '0')}:30`);
        }

        // Verificar disponibilidade de cada horário
        timeSelect.innerHTML = '<option value="">Selecione um horário</option>';
        for (const time of timeSlots) {
            // Verificar se o horário está ocupado
            const isOccupied = appointments.some(appointment => 
                appointment.date === selectedDate && appointment.time === time
            );
            
            if (!isOccupied) {
                const option = document.createElement('option');
                option.value = time;
                option.textContent = time;
                timeSelect.appendChild(option);
            }
        }
    } catch (error) {
        console.error('Erro ao carregar horários:', error);
        timeSelect.innerHTML = '<option value="">Erro ao carregar</option>';
    }
}

// Inicializa o calendário do admin
async function initializeAdminCalendar() {
    const calendarEl = document.getElementById('admin-calendar');
    if (!calendarEl) {
        console.error('Elemento admin-calendar não encontrado');
        return;
    }

    if (adminCalendar) {
        adminCalendar.destroy();
    }

    const barberSelect = document.getElementById('admin-barber-select');
    const viewSelect = document.getElementById('admin-view-select');
    
    adminCalendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'timeGridWeek',
        slotMinTime: '08:00:00',
        slotMaxTime: '20:00:00',
        slotDuration: '00:30:00',
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'timeGridDay,timeGridWeek'
        },
        
        events: async (info, successCallback) => {
            const barberId = barberSelect.value;
            const events = await loadAppointments(barberId, true);
            successCallback(events);
        },
        eventClick: function(info) {
            const { barberName, clientName, clientPhone, appointmentId } = info.event.extendedProps;
            const response = confirm(
                `Agendamento #${appointmentId}\n\n` +
                `Barbeiro: ${barberName}\n` +
                `Cliente: ${clientName}\n` +
                `Telefone: ${clientPhone || 'Não informado'}\n\n` +
                `Deseja cancelar este agendamento?`
            );
            
            if (response) {
                deleteAppointment(appointmentId);
            }
        }
    });
    
    adminCalendar.render();
    
    // Event listener para mudança de barbeiro
    barberSelect.addEventListener('change', () => {
        if (adminCalendar) {
            adminCalendar.refetchEvents();
        }
    });
    
    // Event listener para mudança de visualização
    if (viewSelect) {
        viewSelect.addEventListener('change', () => {
            const viewType = viewSelect.value;
            changeAdminCalendarView(viewType);
        });
    }
    
    // Adicionar botões de navegação personalizados
    addAdminCalendarControls();
}

// Função para mudar a visualização do calendário do admin
function changeAdminCalendarView(viewType) {
    if (!adminCalendar) return;
    
    switch(viewType) {
        case 'day':
            adminCalendar.changeView('timeGridDay');
            break;
        case 'week':
            adminCalendar.changeView('timeGridWeek');
            break;
        default:
            adminCalendar.changeView('timeGridWeek');
    }
}

// Adicionar controles personalizados para o calendário do admin
function addAdminCalendarControls() {
    const calendarControls = document.getElementById('admin-calendar-controls');
    if (!calendarControls) return;
    
    calendarControls.innerHTML = `
        <div style="margin: 10px 0; display: flex; gap: 10px; align-items: center;">
            <label for="admin-view-select">Visualização:</label>
            <select id="admin-view-select" style="padding: 5px;">
                <option value="week">Semana</option>
                <option value="day">Dia</option>
            </select>
            <button onclick="goToToday()" style="padding: 5px 10px;">Hoje</button>
            <button onclick="goToPrevious()" style="padding: 5px 10px;">← Anterior</button>
            <button onclick="goToNext()" style="padding: 5px 10px;">Próximo →</button>
        </div>
    `;
    
    // Configurar event listeners
    const viewSelect = document.getElementById('admin-view-select');
    if (viewSelect) {
        viewSelect.addEventListener('change', () => {
            changeAdminCalendarView(viewSelect.value);
        });
    }
}

// Navegação do calendário - Hoje
function goToToday() {
    if (adminCalendar) {
        adminCalendar.today();
    }
}

// Navegação do calendário - Anterior
function goToPrevious() {
    if (adminCalendar) {
        const currentView = adminCalendar.view;
        if (currentView.type === 'timeGridDay') {
            adminCalendar.prev();
        } else {
            adminCalendar.prev();
        }
    }
}

// Navegação do calendário - Próximo
function goToNext() {
    if (adminCalendar) {
        const currentView = adminCalendar.view;
        if (currentView.type === 'timeGridDay') {
            adminCalendar.next();
        } else {
            adminCalendar.next();
        }
    }
}

// Função para deletar agendamento (admin)
async function deleteAppointment(appointmentId) {
    if (!confirm('Tem certeza que deseja cancelar este agendamento?')) {
        return;
    }

    try {
        const response = await fetch(`/api/appointments/${appointmentId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' }
        });
        
        const data = await response.json();
        if (data.error) {
            alert(data.error);
            return;
        }
        
        alert('Agendamento cancelado com sucesso');
        if (adminCalendar) {
            adminCalendar.refetchEvents();
        }
        if (clientCalendar) {
            clientCalendar.refetchEvents();
        }
    } catch (error) {
        console.error('Erro ao cancelar agendamento:', error);
        alert('Erro ao cancelar agendamento');
    }
}

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

    // Verificar disponibilidade
    const isAvailable = await checkAppointmentAvailability(barberId, date, time);
    if (!isAvailable) {
        alert('Este horário já está ocupado. Por favor, escolha outro horário.');
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
        
        // Limpar campos
        document.getElementById('admin-appointment-date').value = '';
        document.getElementById('admin-appointment-time').value = '';
        
        // Recarregar calendários
        if (adminCalendar) {
            adminCalendar.refetchEvents();
        }
        if (clientCalendar) {
            clientCalendar.refetchEvents();
        }
    } catch (error) {
        console.error('Erro ao marcar agendamento:', error);
        alert('Erro ao marcar agendamento');
    }
}

// Inicializa a aplicação
showLogin();