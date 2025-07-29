// VERSÃO DEFINITIVA E CORRIGIDA
document.addEventListener('DOMContentLoaded', function() {
    // --- ELEMENTOS DO DOM ---
    const anoCalculoEl = document.getElementById('anoCalculo');
    const addEventBtn = document.getElementById('add-event-btn');
    const calculateBtn = document.getElementById('calculate-btn');
    const eventsContainer = document.getElementById('events-container');
    let eventCounter = 0;

    // --- INICIALIZAÇÃO ---
    anoCalculoEl.value = new Date().getFullYear();
    setupInputValidation();
    createEventRow();

    // --- MANIPULADORES DE EVENTOS ---
    addEventBtn.addEventListener('click', createEventRow);
    calculateBtn.addEventListener('click', runCalculation);
    eventsContainer.addEventListener('change', handleEventChange);

    // --- LÓGICA PRINCIPAL E DE CÁLCULO ---

    function runCalculation() {
        const baseCalculoFerias = parseFloat(document.getElementById('baseCalculoFerias').value);
        const baseCalculo13 = parseFloat(document.getElementById('baseCalculo13').value);
        const dataAdmissao = parseDate(document.getElementById('dataAdmissao').value);
        const anoCalculo = parseInt(document.getElementById('anoCalculo').value);

        if (isNaN(baseCalculoFerias) || isNaN(baseCalculo13) || !dataAdmissao || isNaN(anoCalculo)) {
            alert('Por favor, preencha todos os dados de entrada.');
            return;
        }

        clearAllResults();

        const allEvents = getEventsFromDOM();
        const dataCalculoFinal = new Date(anoCalculo, 11, 31);

        let periodos = generateAcquisitionTimeline(dataAdmissao, dataCalculoFinal, allEvents);

        populatePeriodoSelectors(periodos);

        renderFeriasResults(periodos, dataCalculoFinal, baseCalculoFerias, allEvents);
        const decimoTerceiro = calculateDecimoTerceiro(baseCalculo13, dataAdmissao, anoCalculo, allEvents);
        renderDecimoTerceiro(decimoTerceiro);

        document.querySelector('.tabs-container').style.display = 'flex';
        document.getElementById('results-area').style.display = 'block';
        setupTabs();
    }

    function generateAcquisitionTimeline(admissao, calculo, events) {
        let periodos = [];
        let cursor = new Date(admissao);
        let eventosColetivasUtilizados = [];

        while (cursor < calculo) {
            let p_inicio = new Date(cursor);
            let p_fim_teorico = addMonths(new Date(p_inicio), 12);
            p_fim_teorico.setDate(p_fim_teorico.getDate() - 1);

            let periodo = {
                inicio: p_inicio,
                fim: p_fim_teorico,
                status: 'Em Aberto',
                diasDireito: 30,
                diasGozados: 0,
                faltas: 0,
                diasAbono: 0,
                motivoPerda: '',
                licencaRemuneradaDias: 0,
                observacao: ''
            };

            const coletivasEvent = events.find(e =>
                e.type === 'ferias_coletivas' &&
                e.startDate &&
                e.startDate >= p_inicio &&
                e.startDate < p_fim_teorico &&
                !eventosColetivasUtilizados.includes(e)
            );

            let proximoCursor;

            if (coletivasEvent) {
                eventosColetivasUtilizados.push(coletivasEvent);
                const diasColetivas = dateDiffInDays(coletivasEvent.startDate, coletivasEvent.endDate) + 1;
                let mesesCompletos = (coletivasEvent.startDate.getFullYear() - p_inicio.getFullYear()) * 12 + (coletivasEvent.startDate.getMonth() - p_inicio.getMonth());
                if (p_inicio.getDate() > 15) {
                    mesesCompletos--;
                }
                if (coletivasEvent.startDate.getDate() >= 15) {
                    mesesCompletos++;
                }

                const diasDireitoProporcional = Math.round((30 / 12) * mesesCompletos);

                periodo.diasDireito = diasDireitoProporcional;
                periodo.diasGozados = Math.min(diasDireitoProporcional, diasColetivas);
                periodo.status = 'Encerrado';
                periodo.fim = new Date(coletivasEvent.startDate);
                periodo.fim.setDate(periodo.fim.getDate() - 1);
                periodo.observacao = `Período encerrado por Férias Coletivas.`;

                if (diasColetivas > diasDireitoProporcional) {
                    periodo.licencaRemuneradaDias = diasColetivas - diasDireitoProporcional;
                }

                proximoCursor = new Date(coletivasEvent.startDate);
            } else {
                let diasSuspensao = 0;
                events.filter(e => ['afastamento_suspende', 'servico_militar', 'licenca_carcere'].includes(e.type)).forEach(event => {
                    if (event.startDate && event.startDate >= p_inicio && event.startDate < p_fim_teorico) {
                        diasSuspensao += dateDiffInDays(event.startDate, event.endDate) + 1;
                    }
                });
                periodo.fim.setDate(periodo.fim.getDate() + diasSuspensao);
                proximoCursor = new Date(periodo.fim);
                proximoCursor.setDate(proximoCursor.getDate() + 1);
            }

            if (periodo.fim < calculo) {
                periodo.status = 'Encerrado';
            }

            periodos.push(periodo);
            cursor = proximoCursor;
        }

        processEvents(periodos, events);

        for (let i = 0; i < periodos.length - 1; i++) {
            if (periodos[i].observacao.includes('Coletivas') || (periodos[i].motivoPerda && periodos[i].motivoPerda.includes('Afastamento'))) {
                 const dataRetorno = addDays(events.find(e => e.type.includes('zera') && e.startDate >= periodos[i].inicio)?.endDate || periodos[i+1].inicio, 1);
                 periodos[i+1].observacao = `Período aquisitivo reiniciado a partir de ${formatDate(dataRetorno)} devido a evento anterior.`;
            }
        }

        return periodos;
    }

    function processEvents(periodos, events) {
        periodos.forEach(p => {
            p.faltas = 0;
            p.diasAbono = 0;
            if (!p.observacao.includes('Coletivas')) {
                p.diasGozados = 0;
            }
        });

        periodos.forEach(p => {
            let diasDeAfastamentoNoPeriodo = 0;
            events.filter(e => ['afastamento_doenca_zera', 'afastamento_sat_zera'].includes(e.type)).forEach(event => {
                if (!event.startDate || !event.endDate) return;
                const inicioContagem = Math.max(p.inicio.getTime(), event.startDate.getTime());
                const fimContagem = Math.min(p.fim.getTime(), event.endDate.getTime());
                if (inicioContagem < fimContagem) {
                    diasDeAfastamentoNoPeriodo += dateDiffInDays(new Date(inicioContagem), new Date(fimContagem)) + 1;
                }
            });
            if (diasDeAfastamentoNoPeriodo > 180) {
                p.diasDireito = 0;
                p.motivoPerda = `Afastamento por ${diasDeAfastamentoNoPeriodo} dias.`;
            }
        });

        const faltasEvents = events.filter(e => e.type === 'faltas');
        for (const event of faltasEvents) {
            const mesDaFalta = parseDate(event.eventMonth + "-01");
            if (!mesDaFalta) continue;
            for (const p of periodos) {
                if (mesDaFalta >= p.inicio && mesDaFalta <= p.fim) {
                    p.faltas += event.faltas;
                }
            }
        }

        periodos.forEach(p => {
            if (p.diasDireito > 0 && !p.observacao.includes('Coletivas')) {
                if (p.faltas > 32) {
                    p.diasDireito = 0;
                    p.motivoPerda = 'Mais de 32 faltas.';
                } else if (p.faltas >= 24) {
                    p.diasDireito = 12;
                } else if (p.faltas >= 15) {
                    p.diasDireito = 18;
                } else if (p.faltas >= 6) {
                    p.diasDireito = 24;
                }
            }
        });

        events.filter(e => e.type === 'abono_pecuniario' && e.periodoVinculado).forEach(event => {
            const periodoAlvo = periodos.find(p => p.inicio.toISOString() === event.periodoVinculado);
            if (periodoAlvo) {
                periodoAlvo.diasAbono = Math.floor(periodoAlvo.diasDireito / 3);
            }
        });

        events.filter(e => e.type === 'ferias_gozadas' && e.periodoVinculado).forEach(event => {
            if (!event.startDate || !event.endDate) return;
            const diasParaAbater = dateDiffInDays(event.startDate, event.endDate) + 1;
            const periodoAlvo = periodos.find(p => p.inicio.toISOString() === event.periodoVinculado);
            if (periodoAlvo) {
                periodoAlvo.diasGozados += diasParaAbater;
            }
        });
    }

    function calculateDecimoTerceiro(baseCalculo, admissao, ano, events) {
        let mesesConsiderados = Array(12).fill(false);
        for (let i = 0; i < 12; i++) {
            const ultimoDiaMes = new Date(ano, i + 1, 0);
            if (admissao <= ultimoDiaMes) {
                let diasTrabalhadosNoMes = ultimoDiaMes.getDate() - (admissao.getFullYear() === ano && admissao.getMonth() === i ? admissao.getDate() - 1 : 0);
                if (diasTrabalhadosNoMes >= 15) {
                    mesesConsiderados[i] = true;
                }
            }
        }

        events.filter(e => e.type === 'faltas' && e.faltas >= 15).forEach(e => {
            if (!e.eventMonth) return;
            const eventDate = new Date(e.eventMonth + '-02T03:00:00Z');
            if (eventDate.getFullYear() === ano) {
                mesesConsiderados[eventDate.getMonth()] = false;
            }
        });

        const avosDeDireito = mesesConsiderados.filter(Boolean).length;
        const valorPorAvo = baseCalculo > 0 ? baseCalculo / 12 : 0;
        const valorBruto = valorPorAvo * avosDeDireito;
        const primeiraParcela = valorBruto / 2;

        return {
            ano,
            avosDeDireito,
            mesesConsiderados,
            valorBruto,
            primeiraParcela
        };
    }

    // --- FUNÇÕES DE UI E UTILITÁRIAS ---

    function setupInputValidation() {
        document.querySelectorAll('input[type="number"]').forEach(input => {
            input.addEventListener('keydown', e => {
                if (['e', 'E', '+', '-'].includes(e.key)) e.preventDefault();
            });
            input.addEventListener('input', () => {
                if (parseFloat(input.value) < 0) input.value = '';
            });
        });
    }

    function setupTabs() {
        document.querySelectorAll('.tab-link').forEach(button => {
            button.addEventListener('click', () => {
                const tabId = button.dataset.tab;
                document.querySelectorAll('.tab-link').forEach(btn => btn.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
                button.classList.add('active');
                document.getElementById(tabId).classList.add('active');
            });
        });
    }

    function createEventRow() {
        eventCounter++;
        const eventRow = document.createElement('div');
        eventRow.className = 'event-row';
        eventRow.innerHTML = `
            <div class="form-group event-type-group">
                <label>Tipo de Evento</label>
                <select class="event-type">
                    <option value="ferias_gozadas">Férias Gozadas</option>
                    <option value="abono_pecuniario">Vender 1/3 das Férias (Abono)</option>
                    <option value="ferias_coletivas">Férias Coletivas</option>
                    <option value="faltas">Lançar Faltas Injustificadas</option>
                    <optgroup label="Afastamentos e Licenças">
                        <option value="afastamento_doenca_zera">Afastamento Doença/Acidente > 6m</option>
                        <option value="afastamento_suspende">Afastamento < 6m (Suspende)</option>
                        <option value="servico_militar">Serviço Militar (Suspende)</option>
                        <option value="licenca_carcere">Licença Cárcere (Suspende)</option>
                        <option value="licenca_maternidade">Licença Maternidade/Paternidade (Não afeta)</option>
                        <option value="licenca_nojo">Licença Nojo/Gala/Outras (Não afeta)</option>
                    </optgroup>
                </select>
            </div>
            <div class="form-group event-month-group">
                 <label>Mês das Faltas</label>
                 <input type="month" class="event-month">
            </div>
            <div class="form-group event-start-date-group">
                <label>Data Início</label>
                <input type="date" class="event-start-date">
            </div>
            <div class="form-group event-end-date-group">
                <label>Data Fim</label>
                <input type="date" class="event-end-date">
            </div>
            <div class="form-group event-faltas-group">
                <label>Nº de Faltas</label>
                <input type="number" class="event-faltas" placeholder="Ex: 15" min="0">
            </div>
            <div class="form-group periodo-vinculado-group">
                 <label>Vincular ao Período:</label>
                 <select class="periodo-vinculado-select"><option>Calcule para listar</option></select>
            </div>
            <div class="form-group event-valor-group">
                 <label>Base de Cálculo Específica (R$)</label>
                 <input type="number" class="event-valor" placeholder="Opcional" min="0">
            </div>
            <button class="btn-remove" title="Remover Evento">&times;</button>
        `;

        eventsContainer.appendChild(eventRow);

        const eventTypeSelect = eventRow.querySelector('.event-type');
        const faltasGroup = eventRow.querySelector('.event-faltas-group');
        const monthGroup = eventRow.querySelector('.event-month-group');
        const vinculoGroup = eventRow.querySelector('.periodo-vinculado-group');
        const startDateGroup = eventRow.querySelector('.event-start-date-group');
        const endDateGroup = eventRow.querySelector('.event-end-date-group');
        const valorGroup = eventRow.querySelector('.event-valor-group');

        function toggleEventFields() {
            const selectedType = eventTypeSelect.value;
            [faltasGroup, monthGroup, vinculoGroup, startDateGroup, endDateGroup, valorGroup].forEach(el => el.style.display = 'none');
            
            if (selectedType === 'faltas') {
                monthGroup.style.display = 'flex';
                faltasGroup.style.display = 'flex';
            } else if (selectedType === 'abono_pecuniario') {
                vinculoGroup.style.display = 'flex';
            } else if (selectedType === 'ferias_gozadas') {
                startDateGroup.style.display = 'flex';
                endDateGroup.style.display = 'flex';
                vinculoGroup.style.display = 'flex';
                valorGroup.style.display = 'flex';
            } else { // ferias_coletivas e outros afastamentos
                startDateGroup.style.display = 'flex';
                endDateGroup.style.display = 'flex';
                if (selectedType === 'ferias_coletivas') {
                    valorGroup.style.display = 'flex';
                }
            }
        }
        eventTypeSelect.addEventListener('change', toggleEventFields);
        toggleEventFields();
        eventRow.querySelector('.btn-remove').addEventListener('click', () => eventRow.remove());
    }

    function getEventsFromDOM() {
        const events = [];
        document.querySelectorAll('.event-row').forEach(row => {
            const eventType = row.querySelector('.event-type').value;
            const startDate = parseDate(row.querySelector('.event-start-date').value);
            const eventMonth = row.querySelector('.event-month').value;
            const periodoVinculado = row.querySelector('.periodo-vinculado-select').value;
            const valorEspecifico = parseFloat(row.querySelector('.event-valor').value);

            if (startDate || (eventType === 'faltas' && eventMonth) || (eventType === 'abono_pecuniario' && periodoVinculado)) {
                events.push({
                    type: eventType,
                    startDate: startDate,
                    endDate: parseDate(row.querySelector('.event-end-date').value),
                    faltas: parseInt(row.querySelector('.event-faltas').value) || 0,
                    periodoVinculado: periodoVinculado,
                    eventMonth: eventMonth,
                    valor: isNaN(valorEspecifico) ? null : valorEspecifico
                });
            }
        });
        return events.sort((a, b) => (a.startDate || 0) - (b.startDate || 0));
    }

    function populatePeriodoSelectors(periodos) {
        const selectors = document.querySelectorAll('.periodo-vinculado-select');
        selectors.forEach(select => {
            const currentValue = select.value;
            select.innerHTML = '<option value="">Selecione um período...</option>';
            
            periodos.filter(p => p.status === 'Encerrado').forEach(p => {
                const saldoParaGozo = p.diasDireito - p.diasAbono - p.diasGozados;
                if ((p.diasDireito > 0 && p.diasAbono === 0) || saldoParaGozo > 0 || p.inicio.toISOString() === currentValue) {
                    const option = document.createElement('option');
                    option.value = p.inicio.toISOString();
                    option.dataset.saldo = saldoParaGozo;
                    option.textContent = `Período: ${formatDate(p.inicio)} a ${formatDate(p.fim)} (Saldo: ${saldoParaGozo} dias)`;
                    select.appendChild(option);
                }
            });
            select.value = currentValue;
        });
    }

    function handleEventChange(e) {
        if (e.target.classList.contains('event-end-date') || e.target.classList.contains('periodo-vinculado-select')) {
            const row = e.target.closest('.event-row');
            if (row.querySelector('.event-type').value !== 'ferias_gozadas') return;

            const startDateEl = row.querySelector('.event-start-date');
            const endDateEl = row.querySelector('.event-end-date');
            const selectEl = row.querySelector('.periodo-vinculado-select');
            const selectedOption = selectEl.options[selectEl.selectedIndex];

            if (startDateEl.value && endDateEl.value && selectedOption && selectedOption.dataset.saldo) {
                const saldoDisponivel = parseInt(selectedOption.dataset.saldo, 10);
                const diasGozados = dateDiffInDays(parseDate(startDateEl.value), parseDate(endDateEl.value)) + 1;
                if (diasGozados > 0 && diasGozados > saldoDisponivel) {
                    alert(`Erro: O gozo de ${diasGozados} dias excede o saldo de ${saldoDisponivel} dias do período selecionado.`);
                    endDateEl.value = '';
                }
            }
        }
    }

    function renderFeriasResults(periodos, dataCalculo, baseCalculo, events) {
        periodos.forEach(p => {
            let baseCalculoPeriodo = baseCalculo;
            
            const eventoDeGozo = events.find(e => e.periodoVinculado === p.inicio.toISOString() && e.type === 'ferias_gozadas');
            
            if (eventoDeGozo && eventoDeGozo.valor) {
                baseCalculoPeriodo = eventoDeGozo.valor;
            } else if (p.observacao.includes('Coletivas')) {
                 const eventoColetivasCorrespondente = events.find(ev => {
                    return ev.type === 'ferias_coletivas' && p.fim < ev.startDate && addMonths(new Date(p.fim), 12) > ev.startDate;
                 });
                 if (eventoColetivasCorrespondente && eventoColetivasCorrespondente.valor) {
                     baseCalculoPeriodo = eventoColetivasCorrespondente.valor;
                 }
            }
            
            renderCard(p, {
                dataCalculo,
                baseCalculo: baseCalculoPeriodo
            });
        });
    }

    function renderDecimoTerceiro(data) {
        const container = document.getElementById('decimo-terceiro-content');
        const mesesNomes = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
        let mesGridHtml = data.mesesConsiderados.map((contabilizado, i) => {
            const statusClass = contabilizado ? 'contabilizado' : 'perdido';
            return `<div class="mes-card ${statusClass}"><span>${mesesNomes[i]}</span> <span>${contabilizado ? '✔' : '✖'}</span></div>`;
        }).join('');

        container.innerHTML = `
            <h3>13º Salário - Ano de ${data.ano}</h3>
            <div class="decimo-terceiro-details">
                <div class="detail-box"><div class="value">${data.avosDeDireito}/12</div><div class="label">Avos de Direito</div></div>
                <div class="detail-box"><div class="value lost">${12 - data.avosDeDireito}</div><div class="label">Avos Perdidos / Não Adquiridos</div></div>
                <div class="detail-box"><div class="value">${formatCurrency(data.valorBruto)}</div><div class="label">Valor Bruto Estimado</div></div>
                <div class="detail-box"><div class="value">${formatCurrency(data.primeiraParcela)}</div><div class="label">1ª Parcela (a pagar até Nov)</div></div>
            </div>
            <h3>Detalhamento Mês a Mês</h3>
            <div class="mes-a-mes-grid">${mesGridHtml}</div>`;
    }

    function renderCard(p, context) {
        let containerId;
        let statusText = '';
        let statusClass = '';
        const saldoParaGozo = p.diasDireito - p.diasAbono - p.diasGozados;

        if (p.status === 'Em Aberto') {
            statusText = 'Em Aberto';
            statusClass = 'status-aberto';
            containerId = 'periodo-aberto-result';
        } else if (p.diasDireito === 0) {
            statusText = 'Perdido';
            statusClass = 'status-perdido';
            containerId = 'historico-result';
        } else if (saldoParaGozo <= 0 && (p.diasGozados > 0 || p.diasAbono > 0 || p.observacao.includes('Coletivas'))) {
            statusText = 'Gozado Totalmente';
            statusClass = 'status-gozado-total';
            containerId = 'historico-result';
        } else {
            const concessivoFim = addMonths(p.fim, 12);
            if (context.dataCalculo > concessivoFim) {
                statusText = 'Vencido';
                statusClass = 'status-vencido';
            } else if (p.diasGozados > 0 || p.diasAbono > 0) {
                statusText = 'Gozado Parcialmente';
                statusClass = 'status-gozado-parcial';
            } else {
                statusText = 'A Vencer';
                statusClass = 'status-vencer';
            }
            containerId = 'direitos-adquiridos-result';
        }

        let content = `<h4><span>Período: ${formatDate(p.inicio)} a ${formatDate(p.fim)}</span><span class="status ${statusClass}">${statusText}</span></h4>`;

        if (p.observacao) content += `<p><strong>Observação:</strong> ${p.observacao}</p>`;
        if (p.diasDireito === 0 && p.motivoPerda) {
            content += `<p><strong>Motivo da Perda:</strong> ${p.motivoPerda}</p>`;
        } else {
            content += `<p><strong>Dias de Direito:</strong> ${p.diasDireito} (devido a ${p.faltas} faltas)</p>`;
        }
        if (p.diasAbono > 0) content += `<p><strong>Abono Pecuniário:</strong> ${p.diasAbono} dias vendidos</p>`;
        if (p.diasGozados > 0) {
            let label = p.observacao.includes('Coletivas') ? 'Direito Gozado (Coletivas):' : 'Dias Gozados:';
            content += `<p><strong>${label}</strong> ${p.diasGozados} dias</p>`;
        }
        if (p.licencaRemuneradaDias > 0) content += `<p><strong>Licença Remunerada:</strong> ${p.licencaRemuneradaDias} dias</p>`;
        if (p.status !== 'Em Aberto' && p.diasDireito > 0) {
            content += `<p><strong>Saldo para Gozo:</strong> ${saldoParaGozo} dias</p>`;
        }

        if (p.status === 'Encerrado') {
            let summaryContent = '';
            const valorDia = context.baseCalculo / 30;

            if (saldoParaGozo > 0) {
                const valorSaldoFerias = valorDia * saldoParaGozo * (1 + 1 / 3);
                const multiplicador = statusText === 'Vencido' ? 2 : 1;
                summaryContent += `<p><strong>Valor do Saldo de Férias (+1/3):</strong> ${formatCurrency(valorSaldoFerias * multiplicador)} ${statusText === 'Vencido' ? ' (com dobra)' : ''}</p>`;
            }
            if (p.diasGozados > 0) {
                const valorGozado = valorDia * p.diasGozados * (1 + 1 / 3);
                summaryContent += `<p><strong>Valor das Férias Gozadas (+1/3):</strong> ${formatCurrency(valorGozado)}</p>`;
            }
            if (p.diasAbono > 0) {
                const valorAbono = valorDia * p.diasAbono * (1 + 1 / 3);
                summaryContent += `<p><strong>Valor do Abono Pecuniário (+1/3):</strong> ${formatCurrency(valorAbono)}</p>`;
            }
            if (p.licencaRemuneradaDias > 0) {
                const valorLicenca = valorDia * p.licencaRemuneradaDias;
                summaryContent += `<p><strong>Valor da Licença Remunerada:</strong> ${formatCurrency(valorLicenca)}</p>`;
            }
            if (summaryContent !== '') {
                content += `<div class="summary-card">${summaryContent}</div>`;
            }
        }

        if (p.status === 'Em Aberto') {
            let mesesProporcionais = (context.dataCalculo.getFullYear() - p.inicio.getFullYear()) * 12 + (context.dataCalculo.getMonth() - p.inicio.getMonth());
            if (p.inicio.getDate() > 15) mesesProporcionais--;
            if (context.dataCalculo.getDate() >= 15) mesesProporcionais++;
            
            const avos = Math.max(0, Math.min(mesesProporcionais, 12));

            if (avos > 0) {
                content += `<div class="summary-card"><p><strong>Férias Proporcionais:</strong> ${avos}/12 avos</p><p><strong>Valor (Férias Prop. + 1/3):</strong> ${formatCurrency((context.baseCalculo / 12 * avos) * (1 + 1/3))}</p></div>`;
            }
        }

        const card = document.createElement('div');
        card.className = 'period-card';
        card.innerHTML = content;
        document.getElementById(containerId).appendChild(card);
    }

    function clearAllResults() {
        document.getElementById('ferias-content').innerHTML = `
            <div id="periodo-aberto-result" class="result-section"><h3>Período Aquisitivo em Aberto</h3></div>
            <div id="direitos-adquiridos-result" class="result-section"><h3>Direitos Adquiridos (Pendentes e Vencidos)</h3></div>
            <div id="historico-result" class="result-section"><h3>Histórico</h3></div>`;
        document.getElementById('decimo-terceiro-content').innerHTML = '';
    }

    function parseDate(dateString) {
        if (!dateString) return null;
        return new Date(dateString + 'T03:00:00Z');
    }

    function addMonths(date, months) {
        const d = new Date(date);
        d.setMonth(d.getMonth() + months);
        return d;
    }
    
    function addDays(date, days) {
        const d = new Date(date);
        d.setDate(d.getDate() + days);
        return d;
    }

    function dateDiffInDays(a, b) {
        if (!a || !b) return 0;
        const MS_PER_DAY = 1000 * 60 * 60 * 24;
        const utc1 = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
        const utc2 = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
        return Math.round((utc2 - utc1) / MS_PER_DAY);
    }

    function formatDate(date) {
        if (!date || isNaN(date.getTime())) return 'N/A';
        return date.toLocaleDateString('pt-BR', {
            timeZone: 'UTC'
        });
    }

    function formatCurrency(value) {
        if (typeof value !== 'number' || isNaN(value)) return 'R$ 0,00';
        return value.toLocaleString('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        });
    }
});