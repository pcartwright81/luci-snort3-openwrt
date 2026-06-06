/**
 * LuCI Snort3 - Status View
 *
 * Service control (start/stop/restart) is done via the standard luci
 * ubus object (callInitAction), matching the luci-app-lldpd pattern.
 * No custom service_action RPC is used.
 *
 * Install to: /www/luci-static/resources/view/snort/status.js
 */

'use strict';
'require view';
'require rpc';
'require poll';
'require ui';

/* ── luci built-in service helpers ──────────────────────────────────────── */
const callInitList = rpc.declare({
	object: 'luci',
	method: 'getInitList',
	params: ['name'],
	expect: { '': {} }
});

const callInitAction = rpc.declare({
	object: 'luci',
	method: 'setInitAction',
	params: ['name', 'action'],
	expect: { result: false }
});

/* ── snort status RPC ────────────────────────────────────────────────────── */
const callGetStatus = rpc.declare({
	object: 'luci.snort',
	method: 'get_status',
	params: []
});

const callGetAlerts = rpc.declare({
	object: 'luci.snort',
	method: 'get_alerts',
	params: []
});

return view.extend({

	load() {
		return Promise.all([
			callGetStatus(),
			callGetAlerts(),
			callInitList('snort'),
		]);
	},

	_updateStatus(statusData) {
		const running = statusData && statusData.running;
		const el = document.getElementById('snort-status-state');
		if (el) {
			el.innerHTML = running
				? `<span style="color:#4caf50;font-weight:bold">&#9679; ${_('Running')} (PID ${statusData.pid || '?'})</span>`
				: `<span style="color:#f44336;font-weight:bold">&#9679; ${_('Stopped')}</span>`;
		}
		['mem_used','mem_total','mem_percent','alert_count','interface','mode','method'].forEach(k => {
			const e = document.getElementById(`snort-status-${k}`);
			if (e) e.textContent = statusData[k] ?? '';
		});
	},

	render([statusData, alertData]) {
		const running = statusData && statusData.running;

		const node = E([], [
			E('h2', {}, _('Snort Status')),

			/* ── Status card ────────────────────────────────── */
			E('div', { class: 'cbi-section' }, [
				E('div', { class: 'cbi-section-node' }, [
					E('table', { class: 'table' }, [
						E('tr', { class: 'tr' }, [
							E('td', { class: 'td left', style: 'width:30%' }, _('State')),
							E('td', { class: 'td', id: 'snort-status-state' },
								running
									? E('span', { style: 'color:#4caf50;font-weight:bold' }, `\u25cf ${_('Running')} (PID ${statusData.pid || '?'})`)
									: E('span', { style: 'color:#f44336;font-weight:bold' }, `\u25cf ${_('Stopped')}`)
							)
						]),
						E('tr', { class: 'tr' }, [
							E('td', { class: 'td left' }, _('Interface')),
							E('td', { class: 'td', id: 'snort-status-interface' }, statusData.interface || '—')
						]),
						E('tr', { class: 'tr' }, [
							E('td', { class: 'td left' }, _('Mode')),
							E('td', { class: 'td', id: 'snort-status-mode' }, statusData.mode || '—')
						]),
						E('tr', { class: 'tr' }, [
							E('td', { class: 'td left' }, _('Method')),
							E('td', { class: 'td', id: 'snort-status-method' }, statusData.method || '—')
						]),
						E('tr', { class: 'tr' }, [
							E('td', { class: 'td left' }, _('Memory Used')),
							E('td', { class: 'td' }, [
								E('span', { id: 'snort-status-mem_used' }, String(statusData.mem_used || 0)),
								' MB / ',
								E('span', { id: 'snort-status-mem_total' }, String(statusData.mem_total || 0)),
								' MB (',
								E('span', { id: 'snort-status-mem_percent' }, String(statusData.mem_percent || 0)),
								'%)'
							])
						]),
						E('tr', { class: 'tr' }, [
							E('td', { class: 'td left' }, _('Alert Count')),
							E('td', { class: 'td', id: 'snort-status-alert_count' }, String(statusData.alert_count || 0))
						]),
					])
				])
			]),

			/* ── Service control buttons ─────────────────────── */
			E('div', { class: 'cbi-section' }, [
				E('h3', {}, _('Service Control')),
				E('div', { class: 'cbi-section-node' }, [
					E('div', { class: 'cbi-value-field' }, [
						E('button', {
							class: 'btn cbi-button cbi-button-apply',
							click: () => this._serviceAction('start')
						}, `\u25b6 ${_('Start')}`),
						' ',
						E('button', {
							class: 'btn cbi-button cbi-button-reset',
							click: () => this._serviceAction('stop')
						}, `\u25a0 ${_('Stop')}`),
						' ',
						E('button', {
							class: 'btn cbi-button cbi-button-reload',
							click: () => this._serviceAction('restart')
						}, `\u21bb ${_('Restart')}`),
					])
				])
			]),

			/* ── Recent alerts snippet ───────────────────────── */
			E('div', { class: 'cbi-section' }, [
				E('h3', {}, _('Recent Alerts')),
				E('div', { class: 'cbi-section-node' }, [
					E('textarea', {
						id: 'snort-alert-box',
						readonly: 'readonly',
						wrap: 'off',
						style: 'width:100%;min-height:180px;font-size:12px;font-family:monospace',
					}, alertData && alertData.alerts ? alertData.alerts : _('No alerts'))
				])
			]),
		]);

		/* Poll status every 5 s */
		poll.add(() => {
			return Promise.all([callGetStatus(), callGetAlerts()]).then(([s, a]) => {
				this._updateStatus(s);
				const alertBox = document.getElementById('snort-alert-box');
				if (alertBox) alertBox.value = (a && a.alerts) ? a.alerts : _('No alerts');
			});
		}, 5);

		return node;
	},

	_serviceAction(action) {
		const labels = {
			start:   _('Snort started'),
			stop:    _('Snort stopped'),
			restart: _('Snort restarted'),
		};
		callInitAction('snort', action).then(ok => {
			if (ok)
				ui.addNotification(null, E('p', labels[action] || action), 'info');
			else
				ui.addNotification(null, E('p', _('Action failed')), 'error');
			/* Refresh status immediately after action */
			callGetStatus().then(s => this._updateStatus(s));
		});
	},

	handleSaveApply: null,
	handleSave:      null,
	handleReset:     null
});
