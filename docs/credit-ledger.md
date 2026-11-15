# Higgsfield credit ledger

Budget: **10 credits** (free plan, checked by the owner on 2026-11-15).
Protocol: before every generation, check the balance, list model options, pick the cheapest
working setting, state the quoted cost and wait for an explicit "yes". Never guess a price.

| Date | Asset | Model / settings | Quoted | Charged | Balance after | Approved by |
|---|---|---|---|---|---|---|
| 2026-11-15 | (start) | – | – | – | 10 (owner's check) | – |
| 2026-11-15 | s01 plate (test) | gpt_image_2_6, low, 1k, 16:9, 1 image | 0.25 | 0 (refused: "Requires basic plan or higher") | 10 (checked) | owner, "Yes, tạo thử" |
| 2026-11-15 | s01 plate (test) | soul_location, 16:9, 1 image | 1 (exact 0.12) | 0 (refused: "Requires basic plan or higher") | 10 (checked) | owner, "Yes, thử Soul Location" |
| 2026-11-15 | s01 plate (test) | z_image, 16:9, 1 image (job aeef037e) | 0.15 | 0.15 | 9.85 (checked) | owner, "Yes, thử lần lượt" |
| 2026-11-15 | s02 plate | z_image, 16:9, 1 image (job bdc9b39e) | 0.15 | 0.15 | 9.70 (checked) | owner, "Yes, tạo 6 plate" |
| 2026-11-15 | s03 plate | z_image, 16:9, 1 image (job cb51e8f4) | 0.15 | 0.15 | 9.55 (checked) | owner, "Yes, tạo 6 plate" |
| 2026-11-15 | s04 plate | z_image, 16:9, 1 image (job 654bc58a) | 0.15 | 0.15 | 9.40 (checked) | owner, "Yes, tạo 6 plate" |
| 2026-11-15 | s05 plate | z_image, 16:9, 1 image (job 767ac41d) | 0.15 | 0.15 | 9.25 (checked) | owner, "Yes, tạo 6 plate" |
| 2026-11-15 | s06 plate | z_image, 16:9, 1 image (job 5b2d346c) | 0.15 | 0.15 | 9.10 (checked) | owner, "Yes, tạo 6 plate" |
| 2026-11-15 | s07 plate | z_image, 16:9, 1 image (job 0aa72a9e) | 0.15 | 0.15 | 8.95 (checked) | owner, "Yes, tạo 6 plate" |
| 2026-11-15 | s01 v2 realistic (compare) | z_image, 16:9, 1 image (job 3fd9f54a) | 0.15 | 0.15 | 8.80 | owner, "Thử cả ba, so sánh" |
| 2026-11-15 | s01 v2 realistic (compare) | kling_omni_image, 1k, 16:9 | 0.5 | 0 (refused: "Requires basic plan or higher") | 8.80 | owner, "Thử cả ba, so sánh" |
| 2026-11-15 | s01 v2 realistic (compare) | seedream_5_0_flash, 1k, 16:9 (job 1e6ab903; first try 429 rate limit, not charged) | 0.5 | 0.5 | 8.30 (checked) | owner, "Thử cả ba, so sánh" |
| 2026-11-15 | s01-s07 v3 realistic, light wear | z_image, 16:9, 7 images one at a time (batch of 7: 6 refused with 429, not charged) | 1.05 | 1.05 | 7.25 (checked) | owner, "sửa các plate ... trông thật hơn ... ưu tiên tối ưu điểm credit" |
| 2026-11-15 | s01 v4, HAPAG-LLOYD on hull (edit of v3) | ideogram_4_5, very_low, 2k, magic_prompt off (job f9fa1938) | 0.25 | 0.25 | 7.00 (checked) | owner, "Thử s01 trước" |
| 2026-11-15 | s03 v4, HAPAG-LLOYD on hull (edit of v3) | ideogram_4_5, very_low, 2k, magic_prompt off (job 9606dca6) | 0.25 | 0.25 | 6.75 | owner, "Yes, làm s03 và s07" |
| 2026-11-15 | s07 v4, HAPAG-LLOYD on hull (edit of v3) | ideogram_4_5, very_low, 2k, magic_prompt off (job f6606ac0) | 0.25 | 0.25 | 6.50 (checked) | owner, "Yes, làm s03 và s07" |

Free plan runs one Higgsfield job at a time; submit sequentially.

Note: `get_cost` quotes a price even for models the free plan cannot use; the plan check only
happens on submit.

Free plan, 2026-11-15: gpt_image_2_6 and soul_location refused on submit; z_image works.
`use_free_gens` only works from the ChatGPT Higgsfield connector, not from this one.
