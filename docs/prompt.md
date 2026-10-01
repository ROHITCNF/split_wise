# Prompt Log

Verbatim log of every user prompt in this project, in order. Appended after each new prompt.

---

## Prompt 1 — 2026-10-01

Problem statement : People who share expenses most of the time face difficiculty tracking who paid for what , how expenses should be divided fairly , how each person owes to other . 
Solution : I want create a web app  and  the goal is to build a web based application that provide groups of people to record shared expenses , calculate individual obligations , and help members settle outstanding debts without confusion and calculations . 
Now we will discuss thorughly on the requirments gathering

---

## Prompt 2 — 2026-10-01

Decisions :  A. Users & access (1. All users must register before being added to a group. 2. I will choose Google auth and email+password . 3. Expenses only inside group(at this stage later on feedback we will think about that )   B. Expenses (4. At this stage i would like to go with Single payer . 5. we will treat creator of the group as admin and only he will have access to edit/delete . 6. Receipt uploads is out of scope as per today .7. Recurring expenses out of scope ,8.Categories are out of scope )  C. Money (8.We will go ahead with single currency as INR 9.Decimal precision : 2 decimal is enough) D.Settlement(11. just record only payment will b ehappening outside of te app 12. Debt simplification out of scope now 13. Partial settlements are allowed )   E. Notifications(14. In app notifications as per today later we can add email/sms/push ntfn also) F. Reports : we will have weekly expense , monthly expense and will also allow user to donload as csv file .  Apart for this I would like to have Split methods as (equal split , exact amount split , percentage split so that every person feels comfortable)   G. Non-functional ( 16 . small to medium production ready application , , 17 . We will have web based project only u ca avoid reponsible and mobile view ,18. Tecah stack we will discuss later , 19. no deadline , 20.AI is oout of scope as per now . Please review these decisions and identify (a. Missing requirements , b . any Edge cases , c. User actions that have not yet been considered) Do not discuss architecture or implementation yet

---

## Prompt 3 — 2026-10-01

C1. Misunderstanding , Expense creator OR group admin can edit/delete an expense C2. "Weekly/monthly expense" undefined(this report/analytics is per user based expense e.g how much i paid and how much i owe in a particular group ) Forgot/reset password flow (out of scope) , Same email used via Google and via password(merge into one account) , a4. we will give this in profile menu of user , a5 block deletion while any balance is non-zero , a6 . let's logout from single device option be their ,   Group membership(creator of the group seraches by name if user is registered , added directly, user notified , Email not registered : user will not be shown , no group limit and meber limit as per now , 10. Can member leave group? Can admin remove member(member can leave group only if they don't hav eto pay anything, admin can remove member , admin can't transfer role as per now , Group edit (rename, description) every me,ber should be allopweed , 13. Visibility (let's go with all) , 14. notes will b eoptional , 16. past dates allowed  future should be blocked , 15 . Payers must be a group member(or while paying he has to create a new group ) 17. out of scope , 18 .This should be must as it gives transparency , 19.Expense list (search by any remark , date , amount and pagination) 20 . either party can record , 21. Not necesarily but notification will go to reciever , 24. sttlement appears in reports , 22> both the party , 23. free text field , 25. fully agree , 26 . (out of scope) 27. monday 28 across all group , 29 fine , 30 ,: let's go with fixed week , month ,  Balances view(Per group let's implify if A-> B 100 and B-> A 40 then simplify it with overall A-> 60 )  38. english only 36 user sees data of only of their groups , Min screen width (desktop only, ≥1024px?) , Accessibility level(we can ignore now )  b. Edge cases ( Splitting math : Payer absorbs remainder , Allow decimals in percent , Same remainder rule ,  Participant with ₹0 / 0% share: treat as not participant , Single participant(allow, counts in spending reports) , Exact split sum ≠ total let's payer absob it ,  Edits after the fact: Edit expense after it was settled let's not allow in v1 , Change split method on edit (strictly no in v1) Remove participant from an existing expense during edit(let's have this) , Delete expense: hard or soft delete? (Proposed: soft, visible in activity.) last write wins   Settlements(13. warn but allow , 14 . not required , 15. Settlement amount > 0 , 16 . rely on delete  Membership(17 fine with propesed , 18 . fine , 19. no treat as new user , 20 . Admin has power to delete (if he want he can transfer) 21.warning should occure , 22. no , 23. bloick , 24. allowed , Auth ( 25. can't change as per now , 26. both should be allowed (as email password my DB will be storing but Google auth google client will store if confusion we can disuss again this flow) 27. This can't happen as only verified user can only shown in the list of users .  Data & reports(28 , 29 , fine , 30 escaping needed , 31. we will allow only few characters after that ... , 32. by default we will show Indian timezome i.e GMT+5:30 and 24hrs format local markdown in repo and Do not discuss APIs, database schema, architecture, or implementation yet

---

## Prompt 4 — 2026-10-01

 OQ-1 Admin transfer : Admin can leave the group we will show warning , in warning on eflow will be he can make other person as admin or simple leave , simply leving will delte all the things of the group let's finalise this approach) OQ-2 : UX flow will be payer has to be in tbe group 1st OQ-3 drop the lock, allow edit with warning ,  OQ-9 accept for v1 . OQ-8 creation needs 2, later admin may be left alone. ,  OQ-7  all groups by default, with group filter , Proposed: 100 chars, truncated at 40 in lists , 5. let's block , 4. let's go with 1st participant (and add a to if better flow comes we will do thta ) Requirements are now frozen.

---

## Prompt 5 — 2026-10-01

Using the finalised requirements , identify the Core domain entities , Entity responsibilities , Relationships between entities , and user workflows Do not discuss the tech architecture yet  . (also one  seperta thing make prompt.md in docs  and start preffil all my prompts and going ahead after each prompt u hav eto write their )

---

## Prompt 6 — 2026-10-01

DF1: Block edit/delete if any involved member has left. DF2: Let's go with Exact split must equal total if sum !== or <> total block save  , DF4 :My bad ( Admin must use admin leave flow ) DF-5 let's hav ethis as Trip Goa-> Everyone left -> only karan remains No reason to block usage.DF6 Keep notification history. , fine with df3  .

---

## Prompt 7 — 2026-10-01

We have completed and frozen:

Problem Statement

Requirements Document (REQUIREMENTS.md)

Domain Model (DOMAIN_MODEL.md)

 , Review REQUIREMENTS.md and DOMAIN_MODEL.md. , UI we will use reactJS , backend we can use Node+Express , DB we can use sqlite Estimate expected scale (10k users ) . Produce high level architecture , major components and system boundaries . Keep architecture simple an dpredictable , Output should be ADR , tech stack , HLD , Compinent respobsility

---

## Prompt 8 — 2026-10-01

one clarifications : project will b ein local so no worry for deployment , we will not use tanstack querry we will write our own network calling layer in vanilla JS , for primitivie compionents we will use shadcn , google auth (we will mock as per now and give mock user their ) we will make client server architecture .

---

## Prompt 9 — 2026-10-01

Answers : Q1. plain fetch use plain JS , Q2. keep react hook forms , Q3. mock users we can hardcode it just dummy one

---

## Prompt 10 — 2026-10-01

ADRs accepted, go ahead with database schema

---

## Prompt 11 — 2026-10-01

i am fine with s1-s6

---

## Prompt 12 — 2026-10-01

go ahead with API contract

---

## Prompt 13 — 2026-10-01

API 1 : 8–128 characters, no other rules , API-2 :  active members only , fine with 3-6

---

## Prompt 14 — 2026-10-01

i want u to create a UI wireframe for each screen listed in the architecture doc's client components

---

## Prompt 15 — 2026-10-01

1: name : splitbook , 2. agree , 3. full page , 4 . go with light theme only as v1

---

## Prompt 16 — 2026-10-01

create a plan.md 1st with checkboxes . then i will approve

---

## Prompt 17 — 2026-10-01

plan approved, start with M0

---

## Prompt 18 — 2026-10-01

start M1

---

## Prompt 19 — 2026-10-01

let me add it to remote origin git then i will ask u

---

## Prompt 20 — 2026-10-01

1st commit to git , then after each checkpoint keep commiting

---

## Prompt 21 — 2026-10-01

start M2

---

## Prompt 22 — 2026-10-01

Start M3 and keep updating plan.md when last Milestone is finished

---

## Prompt 23 — 2026-10-01

start m4

---

## Prompt 24 — 2026-10-01

I will revisit this group admin deleting their account add in to do as plan and start M5

---

## Prompt 25 — 2026-10-01

start m6

---

## Prompt 26 — 2026-10-01

start m7 and m8 one by one
