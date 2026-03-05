import os
import sys
from pathlib import Path
import datetime

# Add script directory to sys.path
script_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(script_dir))

from trendradar.core.loader import load_config
from trendradar.notification.dispatcher import NotificationDispatcher
from trendradar.notification.splitter import split_content_into_batches

def _get_time():
    return datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

def main():
    message = os.environ.get("PUSH_MESSAGE")
    if not message and len(sys.argv) > 1:
        message = sys.argv[1]
    
    if not message:
        print("No message provided to push.")
        sys.exit(1)

    config = load_config(str(script_dir / "config" / "config.yaml"))
    
    # Create a simplified report data structure that the dispatcher can handle
    # Using a format that mimics trendradar's "standalone" message style
    report_data = {
        "stats": [{
            "word": "异动提醒",
            "count": 1,
            "rank_change": 0,
            "platforms": ["Monitor"],
            "titles": [{"title": message, "platform": "Monitor", "url": "", "mobile_url": "", "ranks": [1], "rank_threshold": 100, "source_name": "行情监控", "time_display": "刚刚", "count": 1}]
        }],
        "new_titles": [],
        "id_to_name": {"Monitor": "异动盯盘引擎"},
        "failed_ids": []
    }
    
    # Configure display to focus on the text
    if "DISPLAY" not in config:
        config["DISPLAY"] = {}
    config["DISPLAY"]["REGIONS"] = {"HOTLIST": True, "AI_ANALYSIS": False, "RSS": False, "STANDALONE": False}

    dispatcher = NotificationDispatcher(config, _get_time, split_content_into_batches)
    
    results = dispatcher.dispatch_all(
        report_data=report_data,
        report_type="📈 行情异动预警",
        update_info=None,
        proxy_url=None,
        mode="current"
    )
    
    print("Push Results:", results)
    
    if any(results.values()):
        sys.exit(0)
    else:
        sys.exit(1)

if __name__ == "__main__":
    main()
