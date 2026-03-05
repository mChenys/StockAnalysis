import asyncio
import os
from browser_use import Agent, Browser
from langchain_google_genai import ChatGoogleGenerativeAI

async def main():
    # 使用用户 .env 中的 key
    os.environ["GOOGLE_API_KEY"] = "AIzaSyDWKwezNs68D73XV0Sr5HK5C0xLtZ_0jlE"
    
    llm = ChatGoogleGenerativeAI(model="gemini-2.0-flash")
    
    agent = Agent(
        task="打开百度，搜索 'browser-use'，并确认页面上是否有 'GitHub' 字样",
        llm=llm
    )
    
    result = await agent.run()
    print(result)

if __name__ == "__main__":
    asyncio.run(main())
