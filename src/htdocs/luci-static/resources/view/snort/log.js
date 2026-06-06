/**
 * LuCI Snort3 - Log View
 *
 * Uses the standard ubus log.read RPC (same as luci-base CBILogreadBox)
 * filtered to messages containing 'snort'. No logread shell calls.
 *
 * Install to: /www/luci-static/resources/view/snort/log.js
 */

'use strict';
'require rpc';
'require uci';
'require view';
'require poll';
'require ui';

/* Same ubus call used by luci-base CBILogreadBox */
const callLogRead = rpc.declare({
	object: 'log',
	method: 'read',
	params: ['lines', 'stream', 'oneshot'],
	expect: { log: [] }
});

const LOG_TAG    = 'snort';
const POLL_SECS  = 5;
const MAX_LINES  = 500;

return view.extend({

	load() {
		return Promise.all([
			uci.load('system'),
			callLogRead(MAX_LINES, false, true),
		]);
	},

	_formatEntries(logEntries) {
		if (!Array.isArray(logEntries) || logEntries.length === 0)
			return _('No Snort log entries yet.');

		const tz = uci.get('system', '@system[0]', 'zonename')?.replaceAll(' ', '_');
		const dateObj = new Intl.DateTimeFormat(undefined, {
			dateStyle: 'medium',
			timeStyle: 'long',
			timeZone: tz
		});

		const lines = logEntries
			.filter(e => e?.msg && e.msg.toLowerCase().includes(LOG_TAG))
			.map(e => {
				const ts = dateObj.format(new Date(e.time));
				return `[${ts}] ${e.msg}`;
			});

		return lines.length > 0
			? lines.join('\n')
			: _('No Snort log entries yet.');
	},

	render([, logEntries]) {
		const initialText = this._formatEntries(logEntries);

		const scrollDownBtn = E('button', {
			class: 'cbi-button cbi-button-neutral',
			click: () => scrollUpBtn.scrollIntoView()
		}, _('Scroll to tail'));

		const scrollUpBtn = E('button', {
			class: 'cbi-button cbi-button-neutral',
			click: () => scrollDownBtn.scrollIntoView()
		}, _('Scroll to head'));

		const maxRowsInput = E('input', {
			type:  'number',
			value: String(MAX_LINES),
			class: 'cbi-input',
			style: 'width:80px',
			min:   '10',
			max:   '5000',
		});

		const textarea = E('textarea', {
			id:       'snort-log-area',
			readonly: 'readonly',
			wrap:     'off',
			style:    'width:100%;min-height:500px;font-size:12px;font-family:monospace',
		}, initialText);

		const node = E([], [
			E('h2', {}, _('Snort Log')),
			E('div', { class: 'cbi-section' }, [
				E('div', { class: 'cbi-section-descr' },
					_('Syslog entries tagged with \'snort\', read via ubus log.read. Refreshes every 5 s.')),
				E('div', { style: 'margin-bottom:8px' }, [
					E('label', { style: 'margin-right:6px' }, _('Max lines:')),
					maxRowsInput,
				]),
				E('div', { style: 'margin-bottom:8px' }, [scrollDownBtn]),
				textarea,
				E('div', { style: 'margin-top:8px' }, [scrollUpBtn]),
			])
		]);

		poll.add(() => {
			const lines = parseInt(maxRowsInput.value, 10) || MAX_LINES;
			return callLogRead(lines, false, true).then(entries => {
				const el = document.getElementById('snort-log-area');
				if (el) el.value = this._formatEntries(entries);
			}).catch(err => {
				ui.addNotification(null, E('p', _('Unable to load log: ') + err.message));
			});
		}, POLL_SECS);

		return node;
	},

	handleSaveApply: null,
	handleSave:      null,
	handleReset:     null
});
