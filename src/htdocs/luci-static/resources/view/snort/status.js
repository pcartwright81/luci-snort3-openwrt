/**
 * LuCI Snort3 Module - Status Page View
 * Copyright (C) 2025 David Dzieciol <david.dzieciol51100@gmail.com>
 *
 * This is free software, licensed under the GNU General Public License v2.
 * See /LICENSE for more information.
 *
 * Replaces: src/view/snort/status_page.htm
 * Install to: /www/luci-static/resources/view/snort/status.js
 */

'use strict';
'require view';
'require poll';
'require rpc';
'require ui';

const callGetStatus = rpc.declare({
	object: 'luci.snort',
	method: 'get_status',
	params: []
});

const callServiceAction = rpc.declare({
	object: 'luci.snort',
	method: 'service_action',
	params: ['action']
});

return view.extend({

	/* Initial data load */
	load: function () {
		return callGetStatus();
	},

	/* Build the DOM once; poll() will update the status rows in place */
	render: function (initialStatus) {
		const view = this;

		/* ── Helpers ──────────────────────────────────────────── */
		function statusBadge(running) {
			const color = running ? 'green' : 'red';
			const label = running ? _('Running') : _('Stopped');
			return `<span style="color:${color};font-weight:bold">&#9679; ${label}</span>`;
		}

		function memBar(used, total, pct) {
			const color = pct > 80 ? 'red' : (pct > 60 ? 'orange' : 'green');
			return `<span style="color:${color}">${used} MB / ${total} MB (${pct}%)</span>`;
		}

		/* ── Row factory ──────────────────────────────────────── */
		function row(label, id, initial) {
			return E('tr', {}, [
				E('td', { style: 'width:30%;font-weight:bold' }, label + ':'),
				E('td', { id })
			]);
		}

		/* ── Status section ───────────────────────────────────── */
		const statusTable = E('table', { style: 'width:100%' }, [
			row(_('Status'),        'snort_status'),
			row('PID',              'snort_pid'),
			row(_('Snort memory'),  'snort_mem'),
			row(_('System memory'), 'sys_mem'),
			row(_('Total alerts'),  'snort_alerts'),
			row(_('Interface'),     'snort_interface'),
			row(_('Mode'),          'snort_mode'),
			row(_('DAQ method'),    'snort_method')
		]);

		/* ── Control buttons ──────────────────────────────────── */
		function makeBtn(id, cls, label, action) {
			return E('button', {
				id,
				class: `btn cbi-button ${cls}`,
				style: 'margin:4px',
				click: function () { view.handleAction(action, this); }
			}, label);
		}

		const controls = E('div', { style: 'padding:10px 0' }, [
			makeBtn('snort-start',   'cbi-button-apply',  '\u25B6 ' + _('Start'),          'start'),
			makeBtn('snort-stop',    'cbi-button-reset',  '\u25A0 ' + _('Stop'),           'stop'),
			makeBtn('snort-restart', 'cbi-button-reload', '\u21BB ' + _('Restart'),        'restart'),
			makeBtn('snort-enable',  'cbi-button-save',   _('Enable at boot'),             'enable'),
			makeBtn('snort-disable', 'cbi-button-remove', _('Disable at boot'),            'disable')
		]);

		/* ── Quick links ──────────────────────────────────────── */
		const quickLinks = E('div', { style: 'padding:10px' }, [
			E('a', {
				href: L.url('admin/services/snort/alerts'),
				class: 'btn cbi-button cbi-button-apply',
				style: 'margin-right:8px'
			}, _('See alerts')),
			E('a', {
				href: L.url('admin/services/snort'),
				class: 'btn cbi-button'
			}, _('Full configuration'))
		]);

		/* ── Full page ────────────────────────────────────────── */
		const page = E([], [
			E('h2', {}, _('Snort IDS/IPS')),

			E('fieldset', { class: 'cbi-section' }, [
				E('legend', {}, _('Service Status')),
				E('div', {
					style: 'background:#f9f9f9;padding:15px;border-radius:5px;border:1px solid #ddd'
				}, [ statusTable ])
			]),

			E('fieldset', { class: 'cbi-section' }, [
				E('legend', {}, _('Controls')),
				controls
			]),

			E('fieldset', { class: 'cbi-section' }, [
				E('legend', {}, _('Quick actions')),
				quickLinks
			])
		]);

		/* ── Apply initial data ───────────────────────────────── */
		if (initialStatus) view.updateStatus(initialStatus);

		/* ── Start polling every 3 s ──────────────────────────── */
		poll.add(function () {
			return callGetStatus().then(function (status) {
				if (status) view.updateStatus(status);
			});
		}, 3);

		return page;
	},

	/** Update the status table rows with fresh data from the RPC. */
	updateStatus: function (s) {
		function set(id, html) {
			const el = document.getElementById(id);
			if (el) el.innerHTML = html;
		}

		const color = s.running ? 'green' : 'red';
		const label = s.running ? _('Running') : _('Stopped');
		set('snort_status',    `<span style="color:${color};font-weight:bold">&#9679; ${label}</span>`);
		set('snort_pid',       s.pid       || 'N/A');
		set('snort_mem',       s.mem_usage || 'N/A');
		set('snort_alerts',    String(s.alert_count));
		set('snort_interface', s.interface  || 'N/A');
		set('snort_mode',      (s.mode   || '').toUpperCase());
		set('snort_method',    (s.method || '').toUpperCase());

		const p = s.mem_percent || 0;
		const c = p > 80 ? 'red' : (p > 60 ? 'orange' : 'green');
		set('sys_mem', `<span style="color:${c}">${s.mem_used} MB / ${s.mem_total} MB (${p}%)</span>`);
	},

	/** Handle a service action button click. */
	handleAction: function (action, btn) {
		const btns = document.querySelectorAll('[id^="snort-"]');
		btns.forEach(b => { b.disabled = true; });

		return callServiceAction(action).then(function (res) {
			btns.forEach(b => { b.disabled = false; });
			if (res && res.success) {
				ui.addNotification(null, E('p', res.message), 'info');
			} else {
				ui.addNotification(null, E('p', (res && res.message) || _('Error')), 'error');
			}
		});
	}
});
