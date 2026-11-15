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

Note: `get_cost` quotes a price even for models the free plan cannot use; the plan check only
happens on submit.

Free plan, 2026-11-15: gpt_image_2_6 and soul_location refused on submit; z_image works.
`use_free_gens` only works from the ChatGPT Higgsfield connector, not from this one.
