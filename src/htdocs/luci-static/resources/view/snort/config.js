/**
 * LuCI Snort3 - Configuration View
 *
 * Service enable/disable follows the luci-app-lldpd pattern:
 * use callInitList / callInitAction (luci ubus object) rather than
 * a custom RPC, so no custom service_action endpoint is needed.
 *
 * Install to: /www/luci-static/resources/view/snort/config.js
 */

'use strict';
'require view';
'require form';
'require uci';
'require rpc';
'require ui';
'require poll';

/* ── luci built-in init helpers (same pattern as luci-app-lldpd) ─────────── */
const callInitList = rpc.declare({
	object: 'luci',
	method: 'getInitList',
	params: ['name'],
	expect: { '': {} },
	filter(res) {
		for (let k in res)
			return +res[k].enabled;
		return null;
	}
});

const callInitAction = rpc.declare({
	object: 'luci',
	method: 'setInitAction',
	params: ['name', 'action'],
	expect: { result: false }
});

/* ── snort-specific RPC (update/status only) ─────────────────────────────── */
const callGetStatus = rpc.declare({
	object: 'luci.snort',
	method: 'get_status',
	params: []
});

const callUpdateRules = rpc.declare({
	object: 'luci.snort',
	method: 'update_rules',
	params: []
});

const callCheckUpdateStatus = rpc.declare({
	object: 'luci.snort',
	method: 'check_update_status',
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

return view.extend({

	load() {
		return Promise.all([
			callInitList('snort'),
			callGetStatus(),
			uci.load('snort'),
		]);
	},

	render([serviceEnabled, statusData]) {
		const m = new form.Map('snort',
			_('Snort IDS/IPS'),
			_('Snort is an open source intrusion detection and prevention system.')
		);

		/* ── Section: Service ─────────────────────────────────── */
		let s = m.section(form.TypedSection, 'snort', _('Service'));
		s.anonymous = true;
		s.addremove = false;

		/* Enable toggle — uses callInitAction exactly like luci-app-lldpd */
		let o = s.option(form.Flag, 'enabled', _('Enable Snort'));
		o.optional  = false;
		o.rmempty   = false;
		o.cfgvalue  = function() {
			return serviceEnabled ? this.enabled : this.disabled;
		};
		o.write = function(section_id, value) {
			uci.set('snort', section_id, 'enabled', value);
			if (value === '1') {
				callInitAction('snort', 'enable').then(() => callInitAction('snort', 'start'));
			} else {
				callInitAction('snort', 'stop').then(() => callInitAction('snort', 'disable'));
			}
		};

		/* Live status indicator */
		let statusOpt = s.option(form.DummyValue, '_status', _('Status'));
		statusOpt.rawhtml = true;
		statusOpt.cfgvalue = function() {
			const running = statusData && statusData.running;
			const color   = running ? '#4caf50' : '#f44336';
			const label   = running ? _('Running') : _('Stopped');
			const pid     = (running && statusData.pid) ? ` (PID ${statusData.pid})` : '';
			return `<span style="color:${color};font-weight:bold">&#9679; ${label}${pid}</span>`;
		};

		/* ── Section: Configuration ───────────────────────────── */
		s = m.section(form.TypedSection, 'snort', _('Configuration'));
		s.anonymous = true;
		s.addremove = false;

		o = s.option(form.Value, 'interface', _('Network Interface'));
		o.placeholder = 'eth0';
		o.rmempty     = false;

		o = s.option(form.ListValue, 'mode', _('Operating Mode'));
		o.value('ids', _('IDS — Detection only'));
		o.value('ips', _('IPS — Inline prevention'));
		o.default = 'ids';

		o = s.option(form.ListValue, 'method', _('Capture Method'));
		o.value('afpacket', 'AF_PACKET');
		o.value('pcap',     'PCAP');
		o.default = 'afpacket';

		o = s.option(form.Value, 'home_net', _('HOME_NET'),
			_('CIDR notation, e.g. 192.168.0.0/24'));
		o.placeholder = '192.168.0.0/24';

		o = s.option(form.Value, 'config_dir', _('Config Directory'));
		o.placeholder = '/etc/snort';

		o = s.option(form.Value, 'rules_dir', _('Rules Directory'));
		o.placeholder = '/etc/snort/rules';

		/* ── Section: Logging ─────────────────────────────────── */
		s = m.section(form.TypedSection, 'snort', _('Logging'));
		s.anonymous = true;
		s.addremove = false;

		o = s.option(form.Flag, 'log_alerts', _('Log Alerts'));
		o.default = '1';

		o = s.option(form.Value, 'log_dir', _('Log Directory'));
		o.placeholder = '/var/log';

		o = s.option(form.ListValue, 'log_format', _('Alert Format'));
		o.value('fast',  'fast');
		o.value('full',  'full');
		o.value('unified2', 'unified2');
		o.default = 'fast';

		/* ── Section: Rules Management ────────────────────────── */
		s = m.section(form.TypedSection, 'snort', _('Rules Management'));
		s.anonymous = true;
		s.addremove = false;

		o = s.option(form.ListValue, 'ruleset', _('Ruleset'));
		o.value('community',  _('Community (free)'));
		o.value('registered', _('Registered (free account)'));
		o.value('subscriber', _('Subscriber (paid)'));
		o.default = 'community';

		o = s.option(form.Value, 'oinkcode', _('Oinkcode'),
			_('Required for Registered/Subscriber rulesets'));
		o.password = true;
		o.depends('ruleset', 'registered');
		o.depends('ruleset', 'subscriber');

		/* Update rules button + progress area */
		let updateOpt = s.option(form.DummyValue, '_update_rules', _('Update Rules'));
		updateOpt.rawhtml = true;
		updateOpt.cfgvalue = function() {
			return `
				<div id="snort-update-wrap">
					<button class="btn cbi-button cbi-button-apply" id="snort-update-btn"
					        onclick="snortUpdateRules()">
						&#8635; ${_('Update Rules Now')}
					</button>
					<button class="btn cbi-button" id="snort-cleanup-btn" style="margin-left:8px"
					        onclick="snortCleanup()">
						&#128465; ${_('Cleanup Temp Files')}
					</button>
					<button class="btn cbi-button" id="snort-fixrules-btn" style="margin-left:8px"
					        onclick="snortFixRules()">
						&#128279; ${_('Fix Rules Symlink')}
					</button>
					<pre id="snort-update-log" style="display:none;margin-top:8px;max-height:200px;overflow:auto;font-size:12px"></pre>
				</div>
			`;
		};

		return m.render().then(node => {
			/* Attach update-rules JS after the form is in the DOM */
			const script = document.createElement('script');
			script.textContent = `
				function snortUpdateRules() {
					const btn = document.getElementById('snort-update-btn');
					const log = document.getElementById('snort-update-log');
					btn.disabled = true;
					log.style.display = 'block';
					log.textContent = '${_('Starting update...')}\\n';
					L.Request.post('/ubus', JSON.stringify({
						jsonrpc:'2.0', id:1, method:'call',
						params:[L.env.sessionid,'luci.snort','update_rules',{}]
					})).then(() => snortPollUpdate());
				}
				function snortPollUpdate() {
					const log = document.getElementById('snort-update-log');
					const timer = setInterval(() => {
						L.Request.post('/ubus', JSON.stringify({
							jsonrpc:'2.0', id:1, method:'call',
							params:[L.env.sessionid,'luci.snort','check_update_status',{}]
						})).then(r => r.json()).then(d => {
							const res = d?.result?.[1] || {};
							if (log) log.textContent = res.log || '';
							if (!res.running) {
								clearInterval(timer);
								const btn = document.getElementById('snort-update-btn');
								if (btn) btn.disabled = false;
							}
						});
					}, 2000);
				}
				function snortCleanup() {
					L.Request.post('/ubus', JSON.stringify({
						jsonrpc:'2.0', id:1, method:'call',
						params:[L.env.sessionid,'luci.snort','cleanup_temp',{}]
					})).then(() => UI.addNotification(null, E('p', '${_('Temp files cleaned')}'), 'info'));
				}
				function snortFixRules() {
					L.Request.post('/ubus', JSON.stringify({
						jsonrpc:'2.0', id:1, method:'call',
						params:[L.env.sessionid,'luci.snort','fix_rules',{}]
					})).then(r => r.json()).then(d => {
						const res = d?.result?.[1] || {};
						UI.addNotification(null, E('p', res.message || ''), res.success ? 'info' : 'error');
					});
				}
			`;
			document.head.appendChild(script);
			return node;
		});
	}
});
