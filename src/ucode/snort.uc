/**
 * LuCI Snort3 Module - ucode RPC Module
 *
 * Only contains operations that need elevated privileges beyond what
 * the luci built-in init/service ubus calls provide:
 *   - get_status   (read proc/uci info)
 *   - get_alerts   (read alert log file)
 *   - update_rules (run rules updater in background)
 *   - check_update_status (poll background update progress)
 *   - cleanup_temp (remove stale temp files)
 *   - fix_rules    (create symlink for rules dir)
 *
 * Service start/stop/restart/enable/disable is handled by the standard
 * luci ubus object (luci.setInitAction / luci.getInitList) in the JS views.
 *
 * Install to: /usr/share/rpcd/ucode/snort
 */

'use strict';

import { access, popen } from 'fs';

function exec(cmd) {
	const fd = popen(cmd, 'r');
	if (!fd) return '';
	const out = fd.read('all');
	fd.close();
	return trim(out);
}

function trim(s) {
	if (!s) return '';
	return replace(s, /^\s+|\s+$/g, '');
}

function uci_get(pkg, section, option) {
	return trim(exec(`uci -q get ${pkg}.${section}.${option}`));
}

/**
 * RPC: get_status
 * Returns current Snort runtime status.
 */
export function get_status() {
	const running = (system('/etc/init.d/snort status >/dev/null 2>&1') === 0);

	const pid = trim(exec("ps | grep '/usr/bin/snort' | grep -v grep | awk '{print $1}'"));

	let mem_usage = 'N/A';
	if (pid !== '') {
		mem_usage = trim(exec(`ps | grep '^[ ]*${pid}' | awk '{print $5}'`));
	}

	const mem_total_kb = +trim(exec("awk '/MemTotal/ {print $2}' /proc/meminfo")) || 0;
	const mem_free_kb  = +trim(exec("awk '/MemFree/ {print $2}' /proc/meminfo"))  || 0;
	const mem_used_kb  = mem_total_kb - mem_free_kb;
	const mem_percent  = mem_total_kb > 0 ? math.floor((mem_used_kb / mem_total_kb) * 100) : 0;

	const alert_count = +trim(exec(
		'[ -f /var/log/alert_fast.txt ] && wc -l < /var/log/alert_fast.txt || echo 0'
	)) || 0;

	const iface  = uci_get('snort', 'snort', 'interface')  || 'N/A';
	const mode   = uci_get('snort', 'snort', 'mode')       || 'N/A';
	const method = uci_get('snort', 'snort', 'method')     || 'N/A';

	return {
		running,
		pid,
		mem_usage,
		mem_total:   math.floor(mem_total_kb / 1024),
		mem_used:    math.floor(mem_used_kb  / 1024),
		mem_free:    math.floor(mem_free_kb  / 1024),
		mem_percent,
		alert_count,
		interface: iface,
		mode,
		method
	};
}

/**
 * RPC: get_alerts
 * Returns last 50 lines from the Snort alert_fast log.
 */
export function get_alerts() {
	const alerts = trim(exec(
		"[ -f /var/log/alert_fast.txt ] && tail -50 /var/log/alert_fast.txt | tac || echo ''"
	));
	return { alerts };
}

/**
 * RPC: update_rules
 * Launches the snort-rules update script in the background.
 * Uses a lock file to prevent concurrent runs.
 */
export function update_rules() {
	const lock_file = '/tmp/snort_rules_update.lock';

	if (access(lock_file)) {
		return { success: false, message: 'Update already in progress...' };
	}

	system(`touch ${lock_file}`);

	const cmd = [
		'/usr/bin/snort-rules > /tmp/snort_rules_update.log 2>&1',
		'rm -f /var/snort.d/*.tar.gz /tmp/snort*.tar.gz 2>/dev/null',
		'rm -f /var/snort.d/rules/*.tar.gz 2>/dev/null',
		`rm -f ${lock_file}`,
		"echo 'FINISHED' >> /tmp/snort_rules_update.log"
	].join('; ');

	system(`(${cmd}) &`);

	return {
		success: true,
		message: 'Update launched in background.'
	};
}

/**
 * RPC: check_update_status
 * Polls the background rules update progress.
 */
export function check_update_status() {
	const lock_file = '/tmp/snort_rules_update.lock';
	const log_file  = '/tmp/snort_rules_update.log';

	const is_locked = !!access(lock_file);
	let log_content = '';
	let is_finished = false;

	if (access(log_file)) {
		log_content = trim(exec(`tail -20 ${log_file}`));
		is_finished = (index(log_content, 'FINISHED') !== null);
	}

	return {
		running:  is_locked && !is_finished,
		finished: is_finished,
		log:      log_content
	};
}

/**
 * RPC: cleanup_temp
 * Removes temporary update artefacts.
 */
export function cleanup_temp() {
	system('rm -f /var/snort.d/*.tar.gz /tmp/snort*.tar.gz 2>/dev/null');
	system('rm -f /var/snort.d/rules/*.tar.gz 2>/dev/null');
	system('rm -f /tmp/snort_rules_update.log 2>/dev/null');
	system('rm -f /tmp/snort_rules_update.lock 2>/dev/null');
	return { success: true, message: 'Temporary files cleaned' };
}

/**
 * RPC: fix_rules
 * Ensures /etc/snort/rules is a symlink pointing to /var/snort.d/rules.
 */
export function fix_rules() {
	const config_rules = '/etc/snort/rules';
	const temp_rules   = '/var/snort.d/rules';
	let success = false;
	let message = '';

	if (system(`[ -d ${temp_rules} ]`) === 0) {
		if (system(`[ -d ${config_rules} ] && [ ! -L ${config_rules} ]`) === 0) {
			system(`mv ${config_rules} ${config_rules}.backup`);
			message = 'Old directory backed up. ';
		} else if (system(`[ -L ${config_rules} ]`) === 0) {
			system(`rm ${config_rules}`);
		}

		if (system(`ln -sf ${temp_rules} ${config_rules}`) === 0) {
			success = true;
			message += 'Symbolic link created successfully';
		} else {
			message += 'Error creating symbolic link';
		}
	} else {
		message = `Directory does not exist: ${temp_rules}`;
	}

	return { success, message };
}
