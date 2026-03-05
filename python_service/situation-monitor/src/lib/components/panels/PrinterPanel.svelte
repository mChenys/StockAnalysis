<script lang="ts">
	import { Panel } from '$lib/components/common';

	interface Props {
		data?: {
			value: number;
			change: number;
			changePercent: number;
			percentOfMax: number;
		} | null;
		loading?: boolean;
		error?: string | null;
	}

	let { data = null, loading = false, error = null }: Props = $props();

	const isExpanding = $derived(data && data.change > 0);
	const status = $derived(isExpanding ? '开启印钞 (ON)' : '印钞停止 (OFF)');
	const statusClass = $derived(isExpanding ? 'critical' : 'monitoring');
</script>

<Panel id="printer" title="全球印钞机 (宽容度)" {status} {statusClass} {loading} {error}>
	{#if (!data || data.value === null || data.value === 0) && loading}
		<div class="loading-state">
			<div class="spinner"></div>
			正在同步美联储数据...
		</div>
	{:else if (!data || data.value === null || data.value === 0) && !loading}
		<div class="empty-state">美联储接口暂时限流或无数据，请稍后刷新</div>
	{:else if data}
		<div class="printer-gauge">
			<div class="printer-label">美联储资产负债规模</div>
			<div class="printer-value">
				{data.value ? data.value.toFixed(2) : '0.00'}<span class="printer-unit">T USD</span>
			</div>
			<div class="printer-change" class:up={isExpanding} class:down={!isExpanding}>
				{data.change !== null && data.change >= 0 ? '+' : ''}{(data.change ? data.change * 1000 : 0).toFixed(0)}B ({data.changePercent !== null && data.changePercent >= 0
					? '+'
					: ''}{(data.changePercent || 0).toFixed(2)}%) WoW
			</div>
			<div class="printer-bar">
				<div class="printer-fill" style="width: {Math.min(data.percentOfMax || 0, 100)}%"></div>
			</div>
			<div class="printer-status">
				<span class="printer-indicator" class:on={isExpanding} class:off={!isExpanding}></span>
				{status}
			</div>
		</div>
	{/if}
</Panel>

<style>
	.printer-gauge {
		text-align: center;
		padding: 0.5rem;
	}

	.printer-label {
		font-size: 0.55rem;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin-bottom: 0.5rem;
	}

	.printer-value {
		font-size: 1.5rem;
		font-weight: 700;
		color: var(--text-primary);
		font-variant-numeric: tabular-nums;
	}

	.printer-unit {
		font-size: 0.7rem;
		font-weight: 400;
		color: var(--text-secondary);
		margin-left: 0.25rem;
	}

	.printer-change {
		font-size: 0.65rem;
		font-weight: 500;
		margin: 0.25rem 0 0.75rem;
	}

	.printer-change.up {
		color: var(--success);
	}

	.printer-change.down {
		color: var(--danger);
	}

	.printer-bar {
		height: 8px;
		background: var(--border);
		border-radius: 4px;
		overflow: hidden;
		margin-bottom: 0.75rem;
	}

	.printer-fill {
		height: 100%;
		background: linear-gradient(90deg, var(--success), var(--accent));
		border-radius: 4px;
		transition: width 0.3s ease;
	}

	.printer-status {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		font-size: 0.7rem;
		font-weight: 600;
		color: var(--text-secondary);
	}

	.printer-indicator {
		width: 8px;
		height: 8px;
		border-radius: 50%;
	}

	.printer-indicator.on {
		background: var(--success);
		box-shadow: 0 0 8px var(--success);
		animation: pulse 1.5s ease-in-out infinite;
	}

	.printer-indicator.off {
		background: var(--danger);
	}

	@keyframes pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.5;
		}
	}

	.empty-state, .loading-state {
		text-align: center;
		color: var(--text-secondary);
		font-size: 0.7rem;
		padding: 1.5rem 1rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.75rem;
	}

	.spinner {
		width: 1.5rem;
		height: 1.5rem;
		border: 2px solid rgba(var(--accent-rgb), 0.1);
		border-top-color: var(--accent);
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}
</style>
