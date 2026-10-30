@echo off
rem Before/after set: Knox Ambience off, on, off, on (full game restart each), then a comparison.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0perf-test.ps1" -AB -Repeat 2 %*
