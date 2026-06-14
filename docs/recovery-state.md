# Redmi Note 12S (sea) Recovery State — For Root Claude

**Date**: 2026-06-05 (updated 2026-06-05)
**Reference**: See `docs/MASTER_REFERENCE.md` for the authoritative full reference.

## Device Identity
- Redmi Note 12S, codename `sea` (board: `ocean`), MT6781 Helio G96
- UFS: Samsung KM8F9001JM-B81, Block size: 0x1000 (4096)
- HyperOS 2, Android 15, Build: **OS2.0.208.0.VHZMIXM** ← CORRECTED (was .212.0)
- Fingerprint: `Redmi/sea_global/sea:15/AP3A.240905.015.A2/OS2.0.208.0.VHZMIXM:user/release-keys`
- Bootloader: LOCKED | A/B slots (active: b)
- Current state: "System has been destroyed" — white screen → black → destroyed

## mtkclient (WORKS — needs sudo on macOS)
- Path: `POVMACHINE/mtkclient/mtk.py`
- Python: `.venv/bin/python3`
- Env: `export DYLD_LIBRARY_PATH="/opt/homebrew/opt/expat/lib:$DYLD_LIBRARY_PATH"`
- Kamakiri exploit bypasses DAA/SLA every time

## Partition Map (from mtkclient GPT)
| Partition | Sector Start | Sectors | Size |
|---|---|---|---|
| misc | 8 | 128 | 512KB ⚠️ WE WROTE 4MB HERE |
| vbmeta_a | 599304 | 2048 | 8MB |
| vbmeta_b | 605448 | 2048 | 8MB |
| boot_a | 708352 | 16384 | 64MB |
| boot_b | 833280 | 16384 | 64MB |

## Image Files — Status
### GOOD ✅
| File | MD5 | Source |
|---|---|---|
| `boot_stock_real.img` (64MB) | `05073b20d349a7ca3457dd534ccf11bc` | Factory boot_a — MATCHES OTA boot.img! |
| `vbmeta_a.img` (8MB) | `406871f415fea497a641ebf36499cb14` | Factory vbmeta_a |
| `firmware_images/` (26 files) | — | Extracted from OTA OS2.0.208.0 |

### BAD ❌ — DELETED
These were removed on 2026-06-05:
- ~~`vbmeta_your.img`~~ — Corrupted vbmeta_b
- ~~`vbmeta_patched.img`~~ — Invalid (hand-crafted, not signed)
- ~~`boot_your.img`~~ — Wrong version (GitHub OS2.0.2.0)
- ~~`magisk_patched.img`~~ — Patched from wrong base
- ~~`misc_zero.bin`~~ — 4MB to 512KB partition (overflow!)

## What Was Flashed (History)
- boot_a/boot_b: boot_stock_real.img ✅
- vbmeta_a/vbmeta_b: vbmeta_a.img ✅
- misc: **4MB to 512KB partition — OVERFLOW!** (now fixed in `flash_final_fix.sh`)

## Root Cause (Why Still Failing)
1. **dm-verity on system** — system partition never restored (primary cause)
2. **vbmeta_system not restored** — separate vbmeta for system hash chain
3. **Misc overflow** — corrupted adjacent partitions (param/persist/nvdata)
4. **RPMB rollback index** — anti-rollback in TEE hardware (only if above fail)

## What We Need for Recovery
1. ~~Full firmware~~ ✅ Downloaded: `firmware.tgz` (6.5GB, OS2.0.208.0)
2. ~~Extract images~~ ✅ Done: `firmware_images/` (26 files, ~10.5GB)
3. ~~Build fix script~~ ✅ Done: `flash_final_fix.sh` (10-step restore)
4. **Run the fix**: `bash flash_final_fix.sh` (requires device in BROM mode)
5. If still failing: flash system+vendor from firmware_images/
6. Last resort: RPMB rollback — paid tools or Xiaomi service center

## Key Scripts
| Script | Purpose |
|---|---|
| `check_device.sh` | Read boot_a + vbmeta_a + seccfg + GPT from device |
| `flash_final_fix.sh` | **USE THIS** — Full 10-step partition restore |
| `flash_factory.sh` | Write boot+vbmeta from factory images to both slots |
| `verify_flash_integrity.sh` | Write+readback+hash verify on boot_a |

## Cleanup Done (2026-06-05)
- ❌ Deleted: 5 bad images (boot_your, vbmeta_your, vbmeta_patched, magisk_patched, misc_zero) — ~208MB
- ❌ Deleted: firmware_ota.zip (4.4GB duplicate) + 2 aria2 partials
- ✅ chown'd: boot_stock_real.img, vbmeta_a.img, .state, hwparam.json → eto:staff
- **Disk saved: ~4.6GB**
