<script lang="ts">
	import Modal from './Modal.svelte';

	interface Props {
		open: boolean;
		onClose: () => void;
	}

	let { open = false, onClose }: Props = $props();

	let channels: any = $state({
		telegram: { bot_token: '', chat_id: '' },
		dingtalk: { webhook_url: '' },
		feishu: { webhook_url: '' },
		wework: { webhook_url: '' },
		bark: { url: '' }
	});

	let loading = $state(false);
	let saving = $state(false);
    let testing = $state(false);

	async function fetchConfig() {
		try {
			loading = true;
			const res = await fetch('/api/push-config', {
				headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` }
			});
			const r = await res.json();
			if (r.success && r.data) {
				// 保留原有引用，深层合并
				for (const key of Object.keys(channels)) {
				    if (r.data[key]) {
				        channels[key] = { ...channels[key], ...r.data[key] };
				    }
				}
			}
		} catch (e) {
			console.error('Failed to load push config', e);
		} finally {
			loading = false;
		}
	}

	async function saveConfig() {
		try {
			saving = true;
			const res = await fetch('/api/push-config', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${localStorage.getItem('token') || ''}`
				},
				body: JSON.stringify(channels)
			});
			const r = await res.json();
			if (r.success) {
				// alert('推送设置已保存！系统下发推送时立即生效。');
				onClose();
			} else {
				alert(r.message || '保存失败');
			}
		} catch (e) {
			console.error(e);
			alert('网络异常');
		} finally {
			saving = false;
		}
	}

    async function testPushConfig() {
		try {
			testing = true;
			const res = await fetch('/api/push-config-test', {
				method: 'POST',
				headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` }
			});
			const r = await res.json();
			if (r.success) {
				alert('测试请求已成功发送至引擎，请去您的客户端 (如企业微信/Telegram等) 检查是否收到测试消息！');
			} else {
				alert('测试发送失败: ' + (r.message || '未知错误'));
			}
		} catch (e) {
			console.error(e);
			alert('网络异常或超时');
		} finally {
			testing = false;
		}
	}

	$effect(() => {
		if (open) {
			fetchConfig();
		}
	});
</script>

<Modal {open} title="TrendRadar 渠道推送配置" {onClose}>
	<div class="push-settings-container">
		{#if loading}
			<div class="loading-state">
				<div class="pulse"></div>
				<p>同步 TrendRadar 数据中...</p>
			</div>
		{:else}
			<p class="section-desc">修改的配置将无缝写入 Python 引擎的 yaml 文件中立即生效。留空则代表该渠道不推送。</p>
			
			<div class="scrollable">
				<div class="channel-group">
					<div class="channel-header">
						<div class="icon tg-icon"></div>
						<h4 class="channel-title">Telegram 机器人设置</h4>
					</div>
					<div class="input-group">
						<label>Bot Token</label>
						<input type="text" bind:value={channels.telegram.bot_token} placeholder="格式: 123456:ABC-DEF1234ghIkl..." />
					</div>
					<div class="input-group">
						<label>Chat ID</label>
						<input type="text" bind:value={channels.telegram.chat_id} placeholder="发送目标 ID，如: -1001234567890" />
					</div>
				</div>

				<div class="channel-group">
					<div class="channel-header">
						<div class="icon ding-icon"></div>
						<h4 class="channel-title">钉钉机器人设置</h4>
					</div>
					<div class="input-group">
						<label>Webhook URL</label>
						<input type="text" bind:value={channels.dingtalk.webhook_url} placeholder="https://oapi.dingtalk.com/robot/send?access_token=..." />
					</div>
				</div>

				<div class="channel-group">
					<div class="channel-header">
						<div class="icon wework-icon"></div>
						<h4 class="channel-title">企业微信机器人设置</h4>
					</div>
					<div class="input-group">
						<label>Webhook URL</label>
						<input type="text" bind:value={channels.wework.webhook_url} placeholder="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=..." />
					</div>
				</div>
                
                <div class="channel-group">
					<div class="channel-header">
						<div class="icon bark-icon"></div>
						<h4 class="channel-title">Bark APP 推送设置</h4>
					</div>
					<div class="input-group">
						<label>Bark URL</label>
						<input type="text" bind:value={channels.bark.url} placeholder="https://api.day.app/your_device_key/" />
					</div>
				</div>
			</div>

			<div class="actions">
				<button type="button" class="test-btn" onclick={testPushConfig} disabled={testing || saving}>
					{testing ? '发送中...' : '发送测试通知'}
				</button>
				<button class="save-btn" disabled={saving || testing} onclick={saveConfig}>
					{saving ? '正在写入脚本配置...' : '保存通道设置'}
				</button>
			</div>
		{/if}
	</div>
</Modal>

<style>
	.push-settings-container {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		max-height: 70vh;
	}

	.section-desc {
		font-size: 0.75rem;
		color: var(--text-muted);
		margin: 0 0 0.5rem;
		line-height: 1.4;
	}

	.scrollable {
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
		padding-right: 0.5rem;
	}

	.scrollable::-webkit-scrollbar {
		width: 4px;
	}
	.scrollable::-webkit-scrollbar-thumb {
		background: rgba(255, 255, 255, 0.1);
		border-radius: 4px;
	}

	.channel-group {
		background: rgba(255, 255, 255, 0.02);
		border: 1px solid rgba(255, 255, 255, 0.05);
		border-radius: 8px;
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.channel-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.25rem;
	}

	.icon {
		width: 14px;
		height: 14px;
		border-radius: 50%;
	}

	.tg-icon { background: #0088cc; }
	.ding-icon { background: #007FFF; }
	.wework-icon { background: #0082EF; }
	.bark-icon { background: #ff3b30; }

	.channel-title {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--text-primary);
		margin: 0;
	}

	.input-group {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.input-group label {
		font-size: 0.7rem;
		color: var(--text-secondary);
		letter-spacing: 0.02em;
	}

	.input-group input {
		background: rgba(0, 0, 0, 0.2);
		border: 1px solid rgba(255, 255, 255, 0.1);
		color: var(--text-primary);
		padding: 0.5rem 0.75rem;
		border-radius: 4px;
		font-size: 0.8rem;
		font-family: inherit;
		transition: all 0.2s ease;
	}

	.input-group input:focus {
		outline: none;
		border-color: var(--accent);
		background: rgba(var(--accent-rgb), 0.05);
	}

	.input-group input::placeholder {
		color: rgba(255, 255, 255, 0.2);
	}

	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.75rem;
		margin-top: 0.5rem;
		padding-top: 1rem;
		border-top: 1px solid rgba(255, 255, 255, 0.1);
	}

	.test-btn {
		background: transparent;
		color: var(--text-primary);
		border: 1px solid rgba(255, 255, 255, 0.2);
		padding: 0.6rem 1.2rem;
		border-radius: 4px;
		font-weight: 600;
		font-size: 0.8rem;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.test-btn:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.1);
	}

	.save-btn {
		background: var(--accent);
		color: var(--bg);
		border: none;
		padding: 0.6rem 1.2rem;
		border-radius: 4px;
		font-weight: 600;
		font-size: 0.8rem;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.save-btn:hover:not(:disabled) {
		filter: brightness(1.1);
		transform: translateY(-1px);
	}

	.save-btn:disabled, .test-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	
	.loading-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 3rem 0;
		color: var(--text-muted);
		gap: 1rem;
		font-size: 0.8rem;
	}
	
	.pulse {
		width: 24px;
		height: 24px;
		border-radius: 50%;
		background: var(--accent);
		animation: pulse 1.5s infinite;
	}

	@keyframes pulse {
		0% { transform: scale(0.8); box-shadow: 0 0 0 0 rgba(var(--accent-rgb), 0.5); }
		70% { transform: scale(1); box-shadow: 0 0 0 10px rgba(var(--accent-rgb), 0); }
		100% { transform: scale(0.8); box-shadow: 0 0 0 0 rgba(var(--accent-rgb), 0); }
	}
</style>
