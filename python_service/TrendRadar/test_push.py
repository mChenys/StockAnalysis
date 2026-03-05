import os
import sys
from pathlib import Path
import datetime

# 初始化并加载模块
script_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(script_dir))

from trendradar.core.loader import load_config
from trendradar.notification.dispatcher import NotificationDispatcher
from trendradar.notification.splitter import split_content_into_batches

def _get_time():
    return datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

def main():
    config = load_config(str(script_dir / "config" / "config.yaml"))
    
    # 模拟一份简单的测试数据，格式按照分发器能处理的基础解构
    report_data = {
        "stats": [{
            "word": "TrendRadar 推送测试",
            "count": 1,
            "rank_change": 0,
            "platforms": ["System"],
            "titles": [{"title": "这是一条来自 AI 股票系统页面的联调测试消息，如果您看到此消息，说明您的渠道配置已生效！", "platform": "System", "url": "", "mobile_url": "", "ranks": [1], "rank_threshold": 100, "source_name": "设置面板", "time_display": "刚刚", "count": 1}]
        }],
        "new_titles": [],
        "id_to_name": {"System": "后台控制台"},
        "failed_ids": []
    }
    
    # 强制开启相关展示区域以便测试
    if "DISPLAY" not in config:
        config["DISPLAY"] = {}
    config["DISPLAY"]["REGIONS"] = {"HOTLIST": True, "AI_ANALYSIS": False, "RSS": False, "STANDALONE": False}

    dispatcher = NotificationDispatcher(config, _get_time, split_content_into_batches)
    
    results = dispatcher.dispatch_all(
        report_data=report_data,
        report_type="🛠️ 系统通道配置测试",
        update_info=None,
        proxy_url=None,
        mode="current"
    )
    
    print("Push Results:", results)
    
    if any(results.values()):
        sys.exit(0)
    else:
        print("所有通道推送好像都失败了或未启用任何通道。")
        sys.exit(1)

if __name__ == "__main__":
    main()
