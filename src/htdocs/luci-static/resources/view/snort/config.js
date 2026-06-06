/**
 * LuCI Snort3 Module - Configuration View
 * Copyright (C) 2025 David Dzieciol <david.dzieciol51100@gmail.com>
 *
 * This is free software, licensed under the GNU General Public License v2.
 * See /LICENSE for more information.
 *
 * Replaces: src/model/cbi/snort/config.lua
 * Install to: /www/luci-static/resources/view/snort/config.js
 */

'use strict';
'require view';
'require form';
'require uci';
'require rpc';
'require ui';

/**
 * RPC call stubs — map to the exported functions in src/ucode/snort.uc
 */
const callCheckUpdateStatus = rpc.declare({
	object: 'luci.snort',
	method: 'check_update_status',
	params: []
});

const callUpdateRules = rpc.declare({
	object: 'luci.snort',
	method: 'update_rules',
	params: []
});

const callCleanupTemp = rpc.declare({
	object: 'luci.snort',
	method: 'cleanup_temp',
	params: []
});

const callFixRules = rpc.declare({
	object: 'luci.snort',
	method: 'fix_rules',
	params: []
});

const callGetStatus = rpc.declare({
	object: 'luci.snort',
	method: 'get_status',
	params: []
});

return view.extend({

	/**
	 * load() is called before render().
	 * Pre-fetch RPC data we need for the page.
	 */
	load: function () {
		return Promise.all([
			callGetStatus(),
			callCheckUpdateStatus()
		]);
	},

	/**
	 * Build the full configuration form.
	 */
	render: function (data) {
		const statusData = data[0] || {};
		const updateData = data[1] || {};

		/* ── Map ────────────────────────────────────────────────── */
		const m = new form.Map('snort',
			_('Snort IDS/IPS'),
			_('Snort is an open source intrusion detection and prevention system.')
		);

		/* ── Section: Service Status ────────────────────────────── */
		let s = m.section(form.TypedSection, 'snort', _('Service Status'));
		s.anonymous = true;
		s.addremove = false;

		// Inline status widget
		let statusWidget = s.option(form.DummyValue, '_status', _('State'));
		statusWidget.rawhtml = true;
		statusWidget.cfgvalue = function () {
			const running = statusData.running;
			const color   = running ? 'green' : 'red';
			const label   = running ? _('Running') : _('Stopped');
			return `<span style="color:${color};font-weight:bold">&#9679; ${label}</span>`;
		};

		// Service control buttons
		const callAction = rpc.declare({
			object: 'luci.snort',
			method: 'service_action',
			params: ['action']
		});

		let ctrlWidget = s.option(form.DummyValue, '_control');
		ctrlWidget.rawhtml = true;
		ctrlWidget.cfgvalue = function () {
			return `
				<div class="cbi-value-field">
					<button class="btn cbi-button cbi-button-apply" id="snort-btn-start"   onclick="snortAction('start')"   >&#9654; ${_('Start')}</button>
					<button class="btn cbi-button cbi-button-reset"  id="snort-btn-stop"    onclick="snortAction('stop')"    >&#9632; ${_('Stop')}</button>
					<button class="btn cbi-button cbi-button-reload" id="snort-btn-restart" onclick="snortAction('restart')" >&#8635; ${_('Restart')}</button>
					<button class="btn cbi-button cbi-button-save"   id="snort-btn-enable"  onclick="snortAction('enable')"  >${_('Enable at boot')}</button>
					<button class="btn cbi-button cbi-button-remove" id="snort-btn-disable" onclick="snortAction('disable')" >${_('Disable at boot')}</button>
				</div>
				<script>
				function snortAction(action) {
					const btns = document.querySelectorAll('[id^="snort-btn-"]');
					btns.forEach(b => { b.disabled = true; });
					rpcd.call('luci.snort', 'service_action', { action })
						.then(res => {
							if (res && res.success) UI.addNotification(null, E('p', res.message), 'info');
							else UI.addNotification(null, E('p', res ? res.message : '${_('Error')}'), 'error');
							btns.forEach(b => { b.disabled = false; });
							location.reload();
						});
				}
				</script>
			`;
		};

		// Recent alerts summary
		let alertsWidget = s.option(form.DummyValue, '_alerts', _('Recent Alerts'));
		alertsWidget.rawhtml = true;
		alertsWidget.cfgvalue = function () {
			const count = statusData.alert_count || 0;
			if (count === 0) {
				return `<span style="color:green">&#10003; ${_('No recent alerts - Your network is secure')}</span>`;
			}
			return `<span style="color:#dc3545;font-weight:bold">
				&#9888; ${_('Detected alerts')}: ${count}
				&nbsp;<a href="${L.url('admin/services/snort/alerts')}" class="btn cbi-button">${_('View all alerts')}</a>
			</span>`;
		};

		/* ── Section: Configuration ─────────────────────────────── */
		s = m.section(form.TypedSection, 'snort', _('Configuration'));
		s.anonymous = true;
		s.addremove = false;

		let o;

		o = s.option(form.Flag, 'enabled', _('Enable Snort'),
			_('Enable or disable Snort service'));
		o.default = '0';
		o.rmempty = false;

		o = s.option(form.Flag, 'manual', _('Manual mode'),
			_('Use manual configuration (snort.lua)'));
		o.default = '1';
		o.rmempty = false;

		o = s.option(form.Value, 'interface', _('Network interface'),
			_('Network interface to monitor (e.g. br-lan, eth0)'));
		o.placeholder = 'br-lan';
		o.datatype = 'string';

		o = s.option(form.Value, 'home_net', _('Local network'),
			_('IP address range to protect'));
		o.placeholder = '192.168.1.0/24';
		o.default = '192.168.1.0/24';
		o.datatype = 'string';

		o = s.option(form.Value, 'external_net', _('External network'),
			_('External IP address range'));
		o.placeholder = 'any';
		o.default = 'any';
		o.datatype = 'string';

		o = s.option(form.ListValue, 'mode', _('Operating mode'),
			_('IDS = Detection only, IPS = Active prevention'));
		o.value('ids', _('IDS (Detection)'));
		o.value('ips', _('IPS (Prevention)'));
		o.default = 'ids';

		o = s.option(form.ListValue, 'method', _('DAQ method'),
			_('Packet acquisition method'));
		o.value('pcap',      'PCAP (Recommended)');
		o.value('afpacket',  'AF_PACKET');
		o.value('nfq',       'NFQ (for IPS)');
		o.default = 'pcap';

		o = s.option(form.Value, 'snaplen', _('Capture Length'),
			_('Maximum packet capture size'));
		o.placeholder = '1518';
		o.default = '1518';
		o.datatype = 'range(1518, 65535)';

		/* ── Section: Logging ───────────────────────────────────── */
		s = m.section(form.TypedSection, 'snort', _('Logging configuration'));
		s.anonymous = true;
		s.addremove = false;

		o = s.option(form.Flag, 'logging', _('Enable logging'),
			_('Enable event logging'));
		o.default = '1';
		o.rmempty = false;

		o = s.option(form.Value, 'log_dir', _('Log directory'),
			_('Path where logs will be stored'));
		o.placeholder = '/var/log';
		o.default = '/var/log';
		o.datatype = 'directory';

		o = s.option(form.Value, 'config_dir', _('Configuration directory'),
			_('Snort configuration directory path'));
		o.placeholder = '/etc/snort';
		o.default = '/etc/snort';
		o.datatype = 'directory';

		o = s.option(form.Value, 'temp_dir', _('Temporary directory'),
			_('Directory for temporary files and downloaded rules'));
		o.placeholder = '/var/snort.d';
		o.default = '/var/snort.d';
		o.datatype = 'directory';

		/* ── Section: Rules Management ──────────────────────────── */
		s = m.section(form.TypedSection, 'snort', _('Rules management'));
		s.anonymous = true;
		s.addremove = false;

		// Update status widget
		let updateStatusWidget = s.option(form.DummyValue, '_update_status', _('Update status'));
		updateStatusWidget.rawhtml = true;
		updateStatusWidget.cfgvalue = function () {
			let statusHtml;
			if (updateData.running) {
				statusHtml = `<span style="color:orange" id="snort-update-status">&#9888; ${_('Update in progress...')}</span>`;
			} else if (updateData.finished) {
				statusHtml = `<span style="color:green" id="snort-update-status">&#10003; ${_('Update completed!')}</span>`;
			} else {
				statusHtml = `<em id="snort-update-status">${_('Click on "Update" to start the rules update')}</em>`;
			}
			return `
				<div style="margin:10px 0">${statusHtml}</div>
				<button class="btn cbi-button cbi-button-apply" onclick="snortUpdateRules()">${_('Update')}</button>
				<script>
				function snortUpdateRules() {
					rpcd.call('luci.snort', 'update_rules', {})
						.then(res => {
							if (res && res.success) snortPollUpdateStatus();
							else UI.addNotification(null, E('p', res ? res.message : '${_('Error')}'), 'error');
						});
				}
				function snortPollUpdateStatus() {
					const el = document.getElementById('snort-update-status');
					if (el) el.innerHTML = '<span style="color:orange">&#9888; ${_('Update in progress...')}</span>';
					const iv = setInterval(() => {
						rpcd.call('luci.snort', 'check_update_status', {})
							.then(status => {
								const el2 = document.getElementById('snort-update-status');
								if (!status) return;
								if (status.finished) {
									clearInterval(iv);
									if (el2) el2.innerHTML = '<span style="color:green">&#10003; ${_('Update completed!')}</span>';
									rpcd.call('luci.snort', 'cleanup_temp', {});
								} else if (!status.running) {
									clearInterval(iv);
								}
							});
					}, 3000);
				}
				// Auto-resume polling if an update was already running
				if (${updateData.running ? 'true' : 'false'}) snortPollUpdateStatus();
				</script>
			`;
		};

		// Rules symlink status widget
		let rulesInfoWidget = s.option(form.DummyValue, '_rules_info', _('Rules location'));
		rulesInfoWidget.rawhtml = true;
		rulesInfoWidget.cfgvalue = function () {
			return `
				<div id="snort-rules-info"><em>${_('Loading...')}</em></div>
				<script>
				rpcd.call('luci.snort', 'get_status', {})
					.then(status => {
						// Rules info is handled via fix_rules RPC below
					});
				function snortFixRules() {
					if (!confirm('${_('Create a symbolic link from /var/snort.d/rules to /etc/snort/rules?')}')) return;
					rpcd.call('luci.snort', 'fix_rules', {})
						.then(res => {
							if (res && res.success) {
								UI.addNotification(null, E('p', '${_('Symbolic link created successfully!')}'), 'info');
								location.reload();
							} else {
								UI.addNotification(null, E('p', res ? res.message : '${_('Error creating symbolic link')}'), 'error');
							}
						});
				}
				</script>
			`;
		};

		o = s.option(form.Value, 'oinkcode', _('Oinkcode'),
			_('Access code to download official Snort rules (optional)'));
		o.placeholder = _('Enter your Oinkcode if you have one');
		o.password = true;

		o = s.option(form.ListValue, 'rule_action', _('Rule action'),
			_('Default action for rules'));
		o.value('default', _('Default'));
		o.value('alert',   _('Alert'));
		o.value('block',   _('Block'));
		o.value('drop',    _('Drop'));
		o.value('reject',  _('Reject'));
		o.default = 'default';

		return m.render();
	}
});
