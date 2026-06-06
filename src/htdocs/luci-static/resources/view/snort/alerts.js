/**
 * LuCI Snort3 - Alerts View
 *
 * Displays the alert_fast log with auto-refresh via poll.
 * Syslog/daemon log is in the separate log.js view.
 *
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

	load() {
		return callGetAlerts();
	},

	render(data) {
		const alerts = (data && data.alerts) ? data.alerts : _('No alerts recorded yet.');

		const node = E([], [
			E('h2', {}, _('Snort Alerts')),
			E('div', { class: 'cbi-section' }, [
				E('div', { class: 'cbi-section-descr' },
					_('Last 50 entries from /var/log/alert_fast.txt, newest first. Refreshes every 10 s.')),
				E('textarea', {
					id:       'snort-alerts-area',
					readonly: 'readonly',
					wrap:     'off',
					style:    'width:100%;min-height:400px;font-size:12px;font-family:monospace',
				}, alerts)
			])
		]);

		poll.add(() => {
			return callGetAlerts().then(d => {
				const el = document.getElementById('snort-alerts-area');
				if (el) el.value = (d && d.alerts) ? d.alerts : _('No alerts recorded yet.');
			});
		}, 10);

		return node;
	},

	handleSaveApply: null,
	handleSave:      null,
	handleReset:     null
});
