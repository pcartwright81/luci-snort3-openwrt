/**
 * LuCI Snort3 Module - Alerts View
 * Copyright (C) 2025 David Dzieciol <david.dzieciol51100@gmail.com>
 *
 * This is free software, licensed under the GNU General Public License v2.
 * See /LICENSE for more information.
 *
 * Replaces: src/view/snort/alerts.htm
 * Install to: /www/luci-static/resources/view/snort/alerts.js
 */

'use strict';
'require view';
'require rpc';
'require poll';

const callGetAlerts = rpc.declare({
	object: 'luci.snort',
	method: 'get_alerts',
	params: []
});

return view.extend({

	load: function () {
		return callGetAlerts();
	},

	render: function (data) {
		const self = this;
		data = data || {};

		/* ── Alert line renderer ──────────────────────────────── */
		function renderLines(text, emptyMsg) {
			if (!text || text.trim() === '') {
				return E('div', { class: 'alert-item' }, [
					E('span', { style: 'color:green;font-weight:bold' }, emptyMsg)
				]);
			}
			return text.trim().split('\n').map(line =>
				E('div', { class: 'alert-item' }, line)
			);
		}

		/* ── Styles ───────────────────────────────────────────── */
		const style = E('style', {}, `
			.snort-alert-box {
				background:#f8f9fa;
				border-left:4px solid #dc3545;
				padding:15px;
				margin:15px 0;
				border-radius:4px;
				font-family:monospace;
				font-size:0.9em;
				max-height:500px;
				overflow-y:auto;
			}
			.snort-log-box {
				background:#f0f0f0;
				border-left:4px solid #007bff;
				padding:15px;
				margin:15px 0;
				border-radius:4px;
				font-family:monospace;
				font-size:0.9em;
				max-height:400px;
				overflow-y:auto;
			}
			.alert-item {
				padding:5px 0;
				border-bottom:1px solid #e0e0e0;
				word-break:break-all;
			}
			.alert-item:last-child { border-bottom:none; }
		`);

		/* ── Alert section ────────────────────────────────────── */
		const alertBox = E('div', { class: 'snort-alert-box', id: 'snort-alert-box' },
			renderLines(data.alerts, _('No alerts recorded'))
		);

		const alertSection = E('fieldset', { class: 'cbi-section' }, [
			E('legend', {}, _('Recent alerts (50 most recent)')),
			alertBox,
			E('div', { style: 'text-align:right;margin-top:10px' }, [
				E('button', {
					class: 'btn cbi-button cbi-button-reload',
					click: function () { self.refreshAlerts(); }
				}, _('Refresh'))
			])
		]);

		/* ── Log section ──────────────────────────────────────── */
		const logBox = E('div', { class: 'snort-log-box', id: 'snort-log-box' },
			renderLines(data.logs, _('No logs'))
		);

		const logSection = E('fieldset', { class: 'cbi-section' }, [
			E('legend', {}, _('Snort system logs (20 most recent)')),
			logBox
		]);

		/* ── Info section ─────────────────────────────────────── */
		const infoSection = E('fieldset', { class: 'cbi-section' }, [
			E('legend', {}, _('Actions')),
			E('div', { style: 'padding:10px' }, [
				E('p', {}, _('View detailed reports via SSH with the command:')),
				E('pre', { style: 'background:#f0f0f0;padding:10px;border-radius:4px' },
					'snort-mgr report -v (requires coreutils-sort package)'),
				E('p', { style: 'margin-top:15px' }, _('Log files:')),
				E('ul', {}, [
					E('li', {}, [ E('code', {}, '/var/log/alert_fast.txt'), ' - ', _('Fast alerts') ]),
					E('li', {}, [ E('code', {}, '/var/log/*alert_json.txt'), ' - ', _('Detailed JSON alerts') ])
				])
			])
		]);

		return E([], [
			style,
			E('h2', {}, _('Snort - Alerts and Logs')),
			alertSection,
			logSection,
			infoSection
		]);
	},

	/** Refresh alert and log boxes without a full page reload. */
	refreshAlerts: function () {
		return callGetAlerts().then(function (data) {
			data = data || {};

			function setBox(id, text, emptyMsg) {
				const box = document.getElementById(id);
				if (!box) return;
				box.innerHTML = '';
				if (!text || text.trim() === '') {
					box.appendChild(E('div', { class: 'alert-item' }, [
						E('span', { style: 'color:green;font-weight:bold' }, emptyMsg)
					]));
				} else {
					text.trim().split('\n').forEach(line => {
						box.appendChild(E('div', { class: 'alert-item' }, line));
					});
				}
			}

			setBox('snort-alert-box', data.alerts, _('No alerts recorded'));
			setBox('snort-log-box',   data.logs,   _('No logs'));
		});
	}
});
