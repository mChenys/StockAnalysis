<script lang="ts">
	import { Panel } from '$lib/components/common';

	interface Prediction {
		id: string;
		question: string;
		yes: number;
		volume: number | string;
		url?: string;
		sentiment?: 'bullish' | 'bearish' | 'neutral';
	}

	interface Props {
		predictions?: Prediction[];
		loading?: boolean;
		error?: string | null;
	}

	let { predictions = [], loading = false, error = null }: Props = $props();

	const count = $derived(predictions.length);

	function formatVolume(v: number | string): string {
		if (typeof v === 'string') return '$' + v;
		if (!v) return '$0';
		if (v >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M';
		if (v >= 1e3) return '$' + (v / 1e3).toFixed(0) + 'K';
		return '$' + v.toFixed(0);
	}
</script>

<Panel id="polymarket" title="Polymarket (事件预测)" {count} {loading} {error}>
	<div class="panel-context">
		真金白银博弈出的预期概率，常作为宏观事件与股市情绪的先行指标
	</div>
	{#if predictions.length === 0 && !loading && !error}
		<div class="empty-state">暂无预测市场数据</div>
	{:else}
		<div class="predictions-list">
			{#each predictions as pred (pred.id)}
				<a
					href={pred.url || 'https://polymarket.com'}
					target="_blank"
					rel="noopener noreferrer"
					class="prediction-item"
				>
					<div class="prediction-main">
						<div class="prediction-info">
							<div class="prediction-question">{pred.question}</div>
							<div class="prediction-meta">
								<span class="meta-label">成交额:</span>
								<span class="meta-value">{formatVolume(pred.volume)}</span>
								{#if pred.sentiment}
									<span class="sentiment-badge" class:bullish={pred.sentiment === 'bullish'} class:bearish={pred.sentiment === 'bearish'}>
										{pred.sentiment === 'bullish' ? '利好股市' : '利空股市'}
									</span>
								{/if}
							</div>
						</div>
						<div class="prediction-odds">
							<div class="odds-label">预测胜率</div>
							<div class="odds-value" class:high={pred.yes > 50} class:low={pred.yes < 20}>
								{pred.yes}%
							</div>
						</div>
					</div>
					<div class="probability-bar-container">
						<div class="probability-bar-fill" style="width: {pred.yes}%" class:high={pred.yes > 50}></div>
					</div>
				</a>
			{/each}
		</div>
	{/if}
</Panel>

<style>
	.panel-context {
		font-size: 0.55rem;
		color: var(--text-muted);
		padding-bottom: 0.5rem;
		border-bottom: 1px dashed var(--border);
		margin-bottom: 0.5rem;
		font-style: italic;
	}

	.predictions-list {
		display: flex;
		flex-direction: column;
	}

	.prediction-item {
		display: flex;
		flex-direction: column;
		padding: 0.65rem 0;
		border-bottom: 1px solid var(--border);
		text-decoration: none;
		transition: background-color 0.2s;
	}

	.prediction-item:hover {
		background-color: rgba(255, 255, 255, 0.03);
	}

	.prediction-item:last-child {
		border-bottom: none;
	}

	.prediction-main {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 0.75rem;
		margin-bottom: 0.4rem;
	}

	.prediction-info {
		flex: 1;
		min-width: 0;
	}

	.prediction-question {
		font-size: 0.65rem;
		color: var(--text-primary);
		line-height: 1.4;
		margin-bottom: 0.3rem;
		font-weight: 500;
	}

	.prediction-meta {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.55rem;
	}

	.meta-label {
		color: var(--text-muted);
	}

	.meta-value {
		color: var(--text-secondary);
	}

	.sentiment-badge {
		font-size: 0.45rem;
		padding: 0.05rem 0.25rem;
		border-radius: 2px;
		font-weight: 600;
		text-transform: uppercase;
	}

	.sentiment-badge.bullish {
		color: var(--success);
		background: rgba(var(--success-rgb), 0.1);
		border: 1px solid rgba(var(--success-rgb), 0.2);
	}

	.sentiment-badge.bearish {
		color: var(--danger);
		background: rgba(var(--danger-rgb), 0.1);
		border: 1px solid rgba(var(--danger-rgb), 0.2);
	}

	.prediction-odds {
		text-align: right;
		min-width: 3.5rem;
	}

	.odds-label {
		font-size: 0.5rem;
		color: var(--text-muted);
		text-transform: uppercase;
		margin-bottom: 0.1rem;
	}

	.odds-value {
		font-size: 0.9rem;
		font-weight: 800;
		color: var(--text-primary);
		font-variant-numeric: tabular-nums;
	}

	.odds-value.high {
		color: var(--success);
	}

	.odds-value.low {
		color: var(--text-muted);
	}

	.probability-bar-container {
		height: 4px;
		background: rgba(255, 255, 255, 0.08);
		border-radius: 2px;
		overflow: hidden;
	}

	.probability-bar-fill {
		height: 100%;
		background: #4a9eff; /* Vibrant blue instead of muted grey */
		border-radius: 2px;
		transition: width 0.3s ease;
		box-shadow: 0 0 5px rgba(74, 158, 255, 0.3);
	}

	.probability-bar-fill.high {
		background: var(--success);
		box-shadow: 0 0 5px rgba(var(--success-rgb), 0.3);
	}

	.empty-state {
		text-align: center;
		color: var(--text-secondary);
		font-size: 0.7rem;
		padding: 1rem;
	}
</style>
