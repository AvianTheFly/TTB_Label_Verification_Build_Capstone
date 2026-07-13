import asyncio
from collections.abc import Awaitable
from typing import TypeVar

T = TypeVar("T")


async def run_with_timeout(coro: Awaitable[T], timeout_seconds: float) -> T:
    task = asyncio.create_task(coro)
    done, _ = await asyncio.wait({task}, timeout=timeout_seconds)
    if task in done:
        return task.result()

    task.cancel()
    task.add_done_callback(_consume_task_result)
    raise TimeoutError


def _consume_task_result(task: asyncio.Task[object]) -> None:
    try:
        task.result()
    except asyncio.CancelledError:
        pass
    except Exception:
        pass
