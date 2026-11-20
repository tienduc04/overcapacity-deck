# Speaking script: Tien Duc (opening, slide 2, slide 6)

Speaking pace is about 130 words a minute. `[→]` means press the right arrow (next step). Every number below
is the one shown on the slide. Do not add numbers that are not on the slide.

---

## Slide 1: Opening (about 40 s, 1 step)

> Good morning. Container shipping just had three of its most profitable years ever, and the carriers spent
> that money on ships. So our question today is simple: **is overcapacity a structural problem, or just
> another cycle?** We look at the supply–demand balance up to 2030.
>
> Five of us will take you there. I start with the orderbook. Aryan covers demand. Akshaya and Akib show how
> the Red Sea detours absorb ships, and what happens when the lanes reopen. Sanjoy explains how carriers can
> respond. I come back at the end with three scenarios for 2030.
>
> Let's board.

`[→]` (the camera flies into the container: slide 2)

---

## Slide 2: The orderbook (about 2 min, 3 steps)

**Step 1: the size**

> Here is the starting point. **16.2 million TEU** of container ships are on order. That is **46.5% of
> today's fleet**, the highest share since 2009. Sources differ: BIMCO says just over 14 million, Linerlytica
> 15.6, so take **14 to 16.2 million** as the range. Every source points the same way.
>
> Two things make it worse. Deliveries are booked **4 to 4.5 years** ahead, against a normal 2 to 2.5, so a
> ship ordered today arrives around 2030. And look at **2028**: almost **6 million TEU** in a single year.
> 2028 and 2029 together bring **10.3 million TEU**, about **30% of the fleet we have today**.

`[→]`

**Step 2: who is ordering**

> The orders are not spread evenly. **MSC** has 3.4 million TEU on order, **45%** of its own fleet.
> **COSCO** is at **51%**. These carriers are betting on scale.
> **Hapag-Lloyd** sits in eighth place with only **20%**: a much more disciplined strategy. Keep that
> contrast in mind for Sanjoy's part.

`[→]`

**Step 3: why, and the trap**

> Why order so much? Four drivers, one line each:
> - **Decarbonisation rules** make old ships more expensive to run, so carriers renew early.
> - **Economies of scale**: about 40 megamax ships of around 24,000 TEU are pending. But the cost per slot
>   only falls when the ship sails full.
> - **The pandemic war chest**: about 536 billion dollars of EBIT in 2021–22 pays for newbuilds in cash.
> - **Alliance realignment**: since Gemini and MSC going solo in 2025, owned ships are the weapon for
>   market share.
>
> That is the **fallacy of composition**. Each order makes sense for one carrier. Together they create a
> supply wave that demand is unlikely to absorb. Drewry calls the overcapacity in 2027–28 "unavoidable".
>
> So supply grows **9 to 12% a year**. Does demand keep up? Aryan.

*(Hand-over to Aryan, slide 3.)*

---

## Slide 6: Three scenarios for 2030 (about 3.5 min, 5 steps)

*(Sanjoy finishes; you take over.)*

**Step 1: how it is built (about 35 s)**

> Thank you, Sanjoy. To bring everything together, I built a model in Python, and this strip shows how it
> works.
> **Data**: every input is tagged as a source, a derived value or our own estimate.
> **Validate**: 61 checks pass. The two failures are expected: they flag real gaps between sources.
> **Model**: fleet plus deliveries, minus scrapping, minus the ships tied up on the Cape route, compared with
> demand.
> **Monte Carlo**: **5,000 runs** with 12 random inputs. The inputs are linked: an early Suez return also
> pushes scrapping up.
> **Stress tests**: 8 tests against published numbers.
> The table below holds the inputs from Req 1 to 5. Each one has its source or is marked as an estimate.

`[→]`

**Step 2: the fan (about 40 s)**

> This is the result: the gap between supply growth and demand growth. Above zero means overcapacity.
> The band covers the middle 80% of the 5,000 runs.
> The median peaks at **+10.5 percentage points in 2028**, exactly the year when 6 million TEU arrive.
> The key point: **even the optimistic edge is +7.1 points**. Nine runs out of ten show more than 7 points
> of overcapacity at the peak. 2028 is not a question of *if*, only *how much*.

`[→]`

**Step 3: three scenarios (about 45 s)**

> From these runs we take three scenarios. Note that "optimistic" is from the **carriers' view**: a tight
> market with little overcapacity.
> - **Optimistic**: demand runs about 2.3 points a year above Drewry. The gap peaks at +8 and is back to
>   about zero by 2030, at **−0.5**. Carriers should hold back slots and order nothing new.
> - **Base**: demand follows Drewry. The gap peaks at +10.7 and is still **+1.8** in 2030. Blank sailings,
>   slow steaming and scrapping the oldest ships.
> - **Downside**: demand runs 2.3 points below Drewry. The gap peaks at +13 and is still **+4.3** in 2030.
>   This needs scrapping beyond the 2016 record, and consolidation.
>
> What separates the three is mostly **demand**. Suez timing and slippage barely move them apart.

`[→]`

**Step 4: what would it take? (about 40 s)**

> So I turned the question around: what would it take to **avoid** overcapacity in 2028?
> - **Demand alone**: it would have to grow **12.7%**, almost the best year on record, the 2010 rebound.
> - **Scrapping alone**: **never**. There are simply not enough old ships: those built in 2005 or earlier
>   total only about 4.3 million TEU.
> - **Slippage alone**: **88%** of 2028 deliveries would have to slip. The worst on record is 33%, in the
>   2009 crisis.
>
> Even demand 3 points higher **and** 40% slippage together still leave +4.8 points.
> **No overcapacity in 2028 is not a realistic scenario.**

`[→]`

**Step 5: robustness, signposts, limits (about 40 s)**

> Does this depend on my assumptions? I re-ran the model with **14 different variants**: other Suez timings,
> slippage, Hormuz, wider and narrower ranges. **In all 14**, the peak stays in 2028 and even the optimistic
> edge shows overcapacity.
>
> What to watch, on the left: demand against Drewry's 4.2% for 2027, the Suez share of Asia–Europe
> capacity, the Strait of Hormuz reopening, and any new orders before 2028.
>
> And to be honest about the limits: this is a **simulation, not a forecast**. Only 5 of 10 published fleet
> forecasts fall inside our band, so the real uncertainty is probably wider.
>
> **Bottom line: overcapacity is structural until at least 2028. The only open question is how fast the
> market recovers by 2030, and that depends on demand.** Thank you.

`[→]` (slide 7: Thank you. Questions?)

---

### Timing check

| Part | Target | Words (approx.) |
|---|---|---|
| Slide 1 | 40 s | ~95 |
| Slide 2 | 2 min | ~300 |
| Slide 6 | 3.5 min | ~520 |

If you run long on slide 6, cut the lists in step 3 down to the 2030 values only (−0.5 / +1.8 / +4.3).
