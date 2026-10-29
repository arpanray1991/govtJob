begin;

alter table public.exams
  add column series_id uuid references public.exams(id) on delete restrict,
  add column level integer not null default 1 check (level between 1 and 10);
update public.exams set series_id = id;
alter table public.exams alter column series_id set not null;
alter table public.exams add constraint exams_series_level_key unique (series_id, level);

-- New series start with a self-referencing level 1; later levels reference it.
create function public.set_exam_series()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.series_id is null then new.series_id := new.id; end if;
  return new;
end;
$$;
create trigger set_exam_series before insert on public.exams
  for each row execute function public.set_exam_series();
revoke all on function public.set_exam_series() from public, anon, authenticated;

insert into public.exams (
  id, series_id, level, category_id, title, description,
  duration_minutes, total_marks, negative_marking_rate, is_published
)
select
  ('21000000-0000-0000-' || lpad(n::text, 4, '0') || '-' ||
    right(e.id::text, 12))::uuid,
  e.id, n, e.category_id, e.title,
  'Level ' || n || ' of 10. ' || e.description,
  e.duration_minutes, e.total_marks, e.negative_marking_rate, e.is_published
from public.exams e
cross join generate_series(2, 10) n
where e.id in (
  '20000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000002'
);

-- Ordered, authored sets: SSC has aptitude, reasoning, English and awareness;
-- IBPS focuses on numerical ability, reasoning and English.
with sets(exam, level, items) as (values
('ssc', 2, '[
 ["A shirt costs 800 before a 10% discount. What is its sale price?","720","700","780","880","A","800 - 10% of 800 = 720.","Quantitative Aptitude"],
 ["Find the next term: 5, 11, 19, 29, __.","39","41","43","45","B","The differences are 6, 8, 10, then 12; 29 + 12 = 41.","Reasoning"],
 ["Choose the correct article: She is __ honest officer.","a","an","the","no article","B","Honest begins with a vowel sound, so use an.","English"],
 ["Which organelle is the main site of aerobic ATP production in a human cell?","Ribosome","Nucleus","Mitochondrion","Golgi apparatus","C","Mitochondria produce most ATP through aerobic respiration.","General Awareness"],
 ["A train covers 150 km in 3 hours. What is its average speed?","45 km/h","50 km/h","55 km/h","60 km/h","B","Speed = distance / time = 150 / 3 = 50 km/h.","Quantitative Aptitude"]
]'::jsonb),
('ssc', 3, '[
 ["An item bought for 500 is sold for 600. What is the profit percentage?","10%","15%","20%","25%","C","Profit is 100; 100 / 500 x 100 = 20%.","Quantitative Aptitude"],
 ["In a code, CAT is DBU. Using the same rule, DOG is __.","EPH","ENH","FPI","CNG","A","Each letter advances one place: D to E, O to P, G to H.","Reasoning"],
 ["Choose the correctly spelled word.","Accomodate","Acommodate","Accommodate","Accommadate","C","Accommodate has double c and double m.","English"],
 ["Which constitutional article guarantees equality before the law?","Article 14","Article 19","Article 21","Article 32","A","Article 14 provides equality before the law and equal protection of the laws.","General Awareness"],
 ["Find the simple interest on 2000 at 5% per year for 3 years.","200","250","300","350","C","Simple interest = 2000 x 5 x 3 / 100 = 300.","Quantitative Aptitude"]
]'::jsonb),
('ssc', 4, '[
 ["An item marked at 1500 is discounted by 20% and sold at a 20% profit. Find its cost price.","900","1000","1100","1200","B","Selling price is 1200, which is 120% of cost; cost = 1200 / 1.2 = 1000.","Quantitative Aptitude"],
 ["All roses are flowers. No flower is a stone. Which conclusion follows?","Some stones are roses","All flowers are roses","No rose is a stone","Some roses are stones","C","Roses are within flowers, and flowers have no overlap with stones.","Reasoning"],
 ["Choose the sentence with correct subject-verb agreement for neither.","Neither of the answers are correct.","Neither of the answers is correct.","Neither answers is correct.","Neither of answers are correct.","B","Neither of takes a singular verb in formal agreement here.","English"],
 ["The 73rd Constitutional Amendment primarily concerns which institutions?","Municipalities","Panchayats","High Courts","Public service commissions","B","The 73rd Amendment gave constitutional status to Panchayati Raj institutions; the 74th concerns municipalities.","General Awareness"],
 ["A can finish a job in 12 days and B in 18 days. How long do they take together?","6 days","7.2 days","8 days","9 days","B","Combined rate = 1/12 + 1/18 = 5/36; time = 36/5 = 7.2 days.","Quantitative Aptitude"]
]'::jsonb),
('ssc', 5, '[
 ["Successive discounts of 20% and 10% are equivalent to a single discount of __.","30%","28%","25%","32%","B","The retained price is 0.8 x 0.9 = 0.72, so the discount is 28%.","Quantitative Aptitude"],
 ["A walks 4 km north, 3 km east and 8 km south. How far and in which direction is A from the start?","5 km southeast","7 km southeast","5 km northeast","4 km south","A","Net displacement is 3 km east and 4 km south; distance = sqrt(9 + 16) = 5 km.","Reasoning"],
 ["Choose the correct passive form: They are repairing the bridge.","The bridge repaired by them.","The bridge is repaired by them.","The bridge is being repaired by them.","The bridge has been repaired by them.","C","The present continuous passive uses is being plus past participle.","English"],
 ["Which pair correctly matches a writ with its purpose?","Habeas corpus - produce a detained person","Mandamus - review a tax rate","Quo warranto - release a prisoner","Prohibition - appoint an official","A","Habeas corpus requires production of a detained person before a court to examine the legality of detention.","General Awareness"],
 ["If x + 1/x = 5, find x squared + 1/x squared.","23","25","27","20","A","Squaring gives x squared + 2 + 1/x squared = 25; subtract 2 to get 23.","Quantitative Aptitude"]
]'::jsonb),
('ssc', 6, '[
 ["A 180 m train passes a pole in 12 seconds. How long does it take to pass a 270 m platform?","18 seconds","24 seconds","30 seconds","36 seconds","C","Speed = 180/12 = 15 m/s. Total distance is 450 m, taking 450/15 = 30 seconds.","Quantitative Aptitude"],
 ["Five people face north in a row. A is immediately left of B, C is immediately right of B, D is at the left end and E at the right end. Who is in the middle?","A","B","C","D","B","The only order is D, A, B, C, E, so B occupies the middle.","Reasoning"],
 ["Choose the correct indirect speech: He said, \"I have finished my work.\"","He said that he has finished his work.","He said that I had finished my work.","He said that he had finished his work.","He said that he finished my work.","C","With a past reporting verb, present perfect normally backshifts to past perfect and pronouns change with the speaker.","English"],
 ["Which combination correctly describes a Money Bill in India?","Article 110; introduced only in Lok Sabha","Article 112; introduced only in Rajya Sabha","Article 110; introduced in either House","Article 123; introduced only in Lok Sabha","A","Article 110 defines a Money Bill; it can be introduced only in Lok Sabha.","General Awareness"],
 ["A cone has radius 3 cm and height 4 cm. Find its total surface area in square cm.","15 pi","21 pi","24 pi","27 pi","C","Slant height = 5 cm. Total surface area = pi r(l + r) = pi x 3 x 8 = 24 pi.","Quantitative Aptitude"]
]'::jsonb),
('ssc', 7, '[
 ["A vessel contains milk and water in a 5:3 ratio. After 16 litres are removed and replaced with water, the ratio becomes 3:5. Find the original volume.","32 litres","40 litres","48 litres","64 litres","B","The milk fraction changes from 5/8 to 3/8: (5/8)(V - 16) = (3/8)V, giving V = 40.","Quantitative Aptitude"],
 ["Some pens are books. All books are papers. No paper is a box. Which must be true?","All pens are papers","Some pens are not boxes","Some boxes are books","No pen is a box","B","The pens that are books are papers and therefore cannot be boxes. Other pens are unrestricted.","Reasoning"],
 ["Choose the correctly formed unreal past conditional.","Had I known, I would help.","Had I known, I would have helped.","If I would know, I had helped.","Had I knew, I would have helped.","B","An unreal past condition uses had plus past participle and would have plus past participle.","English"],
 ["Which combination is correct for a body executing uniform circular motion?","Constant velocity; zero acceleration","Constant speed; inward acceleration","Constant speed; outward acceleration","Changing speed; zero acceleration","B","The velocity direction changes even at constant speed; centripetal acceleration points toward the centre.","General Awareness"],
 ["A boat covers 30 km downstream in 2 hours and 18 km upstream in 3 hours. Find its speed in still water.","9 km/h","10 km/h","10.5 km/h","12 km/h","C","Downstream speed = 15, upstream speed = 6; still-water speed = (15 + 6)/2 = 10.5 km/h.","Quantitative Aptitude"]
]'::jsonb),
('ssc', 8, '[
 ["If x + 1/x = 3, find x to the fourth power + 1/x to the fourth power.","45","47","49","51","B","First x squared + 1/x squared = 9 - 2 = 7. Squaring again and subtracting 2 gives 49 - 2 = 47.","Quantitative Aptitude"],
 ["A is twice as old as B. Six years ago A was three times as old as B. What will be their age ratio six years from now?","3:2","5:3","7:4","2:1","B","A = 2B and A - 6 = 3(B - 6), giving B = 12 and A = 24. In six years the ratio is 30:18 = 5:3.","Reasoning"],
 ["Identify the sentence with correct parallel structure.","She enjoys reading, to swim and cycling.","She enjoys reading, swimming and to cycle.","She enjoys reading, swimming and cycling.","She enjoys to read, swimming and cycling.","C","All three coordinated objects use the same gerund form: reading, swimming, cycling.","English"],
 ["Which statement about the Indian Parliament is correct?","A joint sitting can resolve a deadlock on a Constitutional Amendment Bill.","Rajya Sabha can reject a Money Bill permanently.","A Constitutional Amendment Bill must be passed separately by each House.","Every bill requires approval by half the states.","C","Article 368 requires each House to pass a Constitutional Amendment Bill separately with the prescribed special majority; there is no joint sitting.","General Awareness"],
 ["A and B together finish a job in 12 days; B and C in 15 days; C and A in 20 days. How long do all three take together?","8 days","10 days","12 days","16 days","B","Adding pair rates gives twice the combined rate: 1/12 + 1/15 + 1/20 = 1/5. Combined rate = 1/10.","Quantitative Aptitude"]
]'::jsonb),
('ssc', 9, '[
 ["A right triangle has hypotenuse 25 cm and area 150 square cm. What is its perimeter?","50 cm","55 cm","60 cm","65 cm","C","If legs are a,b then ab = 300 and a squared + b squared = 625. Thus (a+b) squared = 1225, so a+b = 35 and perimeter = 60.","Quantitative Aptitude"],
 ["A, B, C, D, E, F sit in a row facing north. B is immediately right of A; C is immediately right of B; E is immediately right of D; F is at the right end; D is not at an end. Who is third from the left?","B","C","D","E","B","ABC and DE are ordered blocks. With F last, DEABC F would place D at an end, so the order must be A B C D E F.","Reasoning"],
 ["Choose the correctly punctuated restrictive clause.","Candidates, who qualify the prelims, may proceed; this refers only to qualifiers.","Candidates who qualify the prelims may proceed.","Candidates who qualify, the prelims may proceed.","Candidates, who qualify the prelims may proceed.","B","The clause identifies which candidates may proceed and is restrictive, so it is not enclosed in commas.","English"],
 ["Which pair of statements about the basic structure doctrine is correct?","It originated in Kesavananda Bharati; Parliament cannot destroy the basic structure.","It originated in Golaknath; Parliament cannot amend any Fundamental Right.","It originated in Minerva Mills; judicial review was abolished.","It originated in Maneka Gandhi; all amendments need a referendum.","A","Kesavananda Bharati (1973) held that Parliament may amend the Constitution but cannot alter its basic structure.","General Awareness"],
 ["Find the remainder when 7 to the power 103 is divided by 100.","7","43","49","57","B","Powers of 7 modulo 100 cycle as 7,49,43,1. Since 103 leaves remainder 3 on division by 4, the required remainder is 43.","Quantitative Aptitude"]
]'::jsonb),
('ssc', 10, '[
 ["If x + 1/x = 3, find x to the fifth power + 1/x to the fifth power.","113","121","123","125","C","Let S(n) = x^n + x^-n. S(0)=2, S(1)=3, and S(n)=3S(n-1)-S(n-2). This gives 7,18,47,123.","Quantitative Aptitude"],
 ["A, B, C, D, E, F, G stand in a row facing north. C is third from left; A is immediately left of B; D is immediately right of E; G is at the right end; F is right of C but left of E. Who is fifth from left?","D","E","F","B","B","The constraints force A B C F E D G. Therefore E is fifth.","Reasoning"],
 ["Choose the sentence with both correct inversion and agreement.","Not only the manager but also the clerks was absent.","Not only was the manager absent, but the clerks were also absent.","Not only the manager was absent, but also were the clerks.","Not only was the manager absent, but the clerks was also absent.","B","Initial not only triggers subject-auxiliary inversion in the first clause; the plural clerks takes were in the second.","English"],
 ["Which statement correctly combines fiscal deficit and primary deficit?","Primary deficit equals fiscal deficit plus interest payments.","Fiscal deficit excludes borrowing from expenditure.","Primary deficit equals fiscal deficit minus interest payments.","Fiscal deficit equals revenue expenditure minus revenue receipts only.","C","Fiscal deficit is total expenditure minus receipts excluding borrowings. Primary deficit removes interest payments from fiscal deficit.","General Awareness"],
 ["Two fair dice are rolled. Given that at least one die shows 4, what is the probability that the sum is at least 9?","2/11","4/11","1/3","5/11","B","There are 11 ordered outcomes with at least one 4. Favourable outcomes are (4,5),(4,6),(5,4),(6,4), giving 4/11.","Quantitative Aptitude"]
]'::jsonb),
('ibps', 2, '[
 ["An account balance of 600 increases by 15%. What is the new balance?","660","675","690","720","C","The increase is 90, so the balance becomes 690.","Quantitative Aptitude"],
 ["Find the next term: 7, 14, 28, 56, __.","84","98","112","120","C","Each term is doubled; 56 x 2 = 112.","Reasoning"],
 ["Choose the correct word: Each of the applicants __ a form.","have","has","are having","were having","B","Each is singular, so the verb is has.","English"],
 ["The average of five numbers is 18. What is their sum?","72","80","90","100","C","Sum = average x count = 18 x 5 = 90.","Quantitative Aptitude"],
 ["P is Q''s sister. Q is R''s father. How is P related to R?","Mother","Aunt","Sister","Grandmother","B","The sister of one''s father is one''s aunt.","Reasoning"]
]'::jsonb),
('ibps', 3, '[
 ["A deposit earns simple interest of 360 in 3 years at 6% per year. Find the principal.","1800","2000","2200","2400","B","Principal = 360 x 100 / (6 x 3) = 2000.","Quantitative Aptitude"],
 ["In a code, BANK is CBOL. How is LOAN coded?","MPBO","KNZM","MPBM","NQCP","A","Each letter advances one position: L to M, O to P, A to B, N to O.","Reasoning"],
 ["Choose the word closest in meaning to prudent.","Careless","Cautious","Wasteful","Hasty","B","Prudent describes careful, sensible judgment.","English"],
 ["A sum of 840 is shared in the ratio 2:3:7. Find the largest share.","420","480","490","560","C","Total parts = 12; each part is 70; largest share = 7 x 70 = 490.","Quantitative Aptitude"],
 ["R is 9th from the top and 12th from the bottom in a queue. How many people are there?","19","20","21","22","B","Total = 9 + 12 - 1 = 20, subtracting the person counted twice.","Reasoning"]
]'::jsonb),
('ibps', 4, '[
 ["A price increases by 20% and then decreases by 20%. What is the net change?","No change","4% decrease","4% increase","2% decrease","B","The final multiplier is 1.2 x 0.8 = 0.96, a 4% decrease.","Quantitative Aptitude"],
 ["All managers are employees. Some employees are trainees. Which conclusion necessarily follows?","Some managers are trainees","All trainees are managers","All managers are employees","No manager is a trainee","C","Only the stated inclusion is certain; the overlap between managers and trainees is not determined.","Reasoning"],
 ["Choose the sentence correctly describing employment continuing since 2020.","She has been working here since 2020.","She is working here since 2020.","She has working here since 2020.","She have been working here since 2020.","A","An action continuing from a past starting point uses present perfect continuous with since.","English"],
 ["A and B invest 4000 and 6000 for the same duration. B receives 900 of the profit. Find the total profit.","1200","1350","1500","1800","C","The profit ratio is 2:3. Three parts are 900; five parts are 1500.","Quantitative Aptitude"],
 ["A person walks 6 km east, 8 km north and 6 km west. Where are they relative to the starting point?","8 km north","8 km south","10 km northeast","14 km north","A","East and west movements cancel, leaving 8 km north.","Reasoning"]
]'::jsonb),
('ibps', 5, '[
 ["Find the compound interest on 5000 for 2 years at 10% per year, compounded annually.","1000","1050","1100","1150","B","Amount = 5000 x 1.1 squared = 6050; interest = 1050.","Quantitative Aptitude"],
 ["Find the missing term: 4, 9, 19, 39, __.","59","69","79","89","C","Each term is twice the previous term plus 1; 39 x 2 + 1 = 79.","Reasoning"],
 ["Choose the correct word: No sooner had the meeting begun __ the lights went out.","when","than","then","that","B","The standard correlative construction is no sooner ... than.","English"],
 ["A shop sells 120, 150 and 180 units over three days. By what percentage do third-day sales exceed the three-day average?","10%","15%","20%","25%","C","Average = 450/3 = 150. The excess is 30, which is 20% of 150.","Quantitative Aptitude"],
 ["Five people face north. S is at the left end; P is immediately left of Q; R is immediately right of Q; T is at the right end. Who is second from right?","P","Q","R","S","C","The unique order is S P Q R T, so R is second from right.","Reasoning"]
]'::jsonb),
('ibps', 6, '[
 ["A 40-litre mixture contains milk and water in a 3:1 ratio. How much water must be added to make the ratio 3:2?","5 litres","10 litres","15 litres","20 litres","B","There are 30 litres of milk and 10 of water. For a 3:2 ratio, water must become 20 litres, so add 10.","Quantitative Aptitude"],
 ["Some loans are secured. All secured items are insured. No insured item is risky. Which follows?","All loans are insured","Some loans are not risky","No loan is risky","All risky items are loans","B","The secured loans are insured and therefore not risky; nothing is known about all other loans.","Reasoning"],
 ["Identify the grammatically correct sentence.","The number of applications have risen.","A number of applications has arrived.","The number of applications has risen.","The number of application have risen.","C","The number of takes a singular verb; a number of normally takes a plural verb.","English"],
 ["A boat travels 24 km downstream in 2 hours and 24 km upstream in 4 hours. Find the stream speed.","2 km/h","3 km/h","6 km/h","9 km/h","B","Downstream speed = 12 and upstream speed = 6. Stream speed = (12 - 6)/2 = 3 km/h.","Quantitative Aptitude"],
 ["A is B''s brother; B is C''s mother; D is A''s father. How is D related to C?","Paternal grandfather","Maternal grandfather","Uncle","Brother","B","D is the father of B as well as A. Since B is C''s mother, D is C''s maternal grandfather.","Reasoning"]
]'::jsonb),
('ibps', 7, '[
 ["A invests 6000 for 8 months and B invests 8000 for 6 months. If total profit is 4200, find A''s share.","1800","2000","2100","2400","C","Capital-time products are both 48000, so profit is shared equally; A receives 2100.","Quantitative Aptitude"],
 ["Six people A, B, C, D, E, F face north in a row. A is at the left end, F at the right end; C is immediately right of B; E is immediately right of D; B is left of D. Who is fourth from left?","B","C","D","E","C","The constraints give A B C D E F, so D is fourth.","Reasoning"],
 ["Choose the best revision: Despite of the delay, the team completed the task.","Despite the delay, the team completed the task.","Despite to the delay, the team completed the task.","In despite the delay, the team completed the task.","Although the delay, the team completed the task.","A","Despite directly precedes a noun phrase without of. Alternatively use in spite of.","English"],
 ["A bag contains 5 red and 3 blue balls. Two are drawn without replacement. What is the probability both are red?","5/14","25/64","3/8","5/8","A","Probability = (5/8)(4/7) = 20/56 = 5/14.","Quantitative Aptitude"],
 ["Find the next term: 2, 6, 15, 31, 56, __.","81","87","92","96","C","The increments are 4, 9, 16, 25, then 36, consecutive squares. Thus 56 + 36 = 92.","Reasoning"]
]'::jsonb),
('ibps', 8, '[
 ["A pipe fills a tank in 12 hours, another in 18 hours and a drain empties it in 36 hours. If all open together, how long to fill an empty tank?","6 hours","8 hours","9 hours","12 hours","C","Net rate = 1/12 + 1/18 - 1/36 = 1/9, so filling takes 9 hours.","Quantitative Aptitude"],
 ["All analysts are graduates. Some graduates are auditors. No auditor is a trainee. Which conclusion necessarily follows?","No analyst is a trainee","Some graduates are not trainees","All graduates are auditors","Some analysts are auditors","B","The graduates who are auditors cannot be trainees; analysts need not overlap with auditors.","Reasoning"],
 ["Choose the correct mixed conditional for a past decision affecting the present.","If I had accepted the offer, I would be working there now.","If I accepted the offer, I would have worked there yesterday.","If I had accept the offer, I would work there now.","If I would have accepted the offer, I am working there now.","A","Past unreal condition uses had accepted, while its present unreal result uses would be working.","English"],
 ["Branch A processes 240 requests, 25% rejected. Branch B processes 360 requests, one third rejected. What percentage of all requests are accepted?","65%","68%","70%","75%","C","Accepted requests are 180 and 240, totalling 420 out of 600, or 70%.","Quantitative Aptitude"],
 ["If x squared - 11x + 30 = 0 and y squared - 7y + 12 = 0, what is the relation between x and y?","x > y","x < y","x = y","Cannot be determined","A","Roots for x are 5,6 and roots for y are 3,4. Every possible x is greater than every possible y.","Reasoning"]
]'::jsonb),
('ibps', 9, '[
 ["A can finish a task in 20 days and B in 30 days. They work together for 6 days, then A leaves. How many more days does B need?","10","12","15","18","C","Together they do 1/12 per day, so 6 days completes half. B needs 30 x 1/2 = 15 more days.","Quantitative Aptitude"],
 ["Seven people A to G face north in a row. D is fourth; A is immediately left of B, who is immediately left of C; E is immediately left of F; G is at the right end. Who is second from right?","C","E","F","B","C","D splits the first and last three seats. ABC must occupy seats 1-3 and E F G seats 5-7. F is second from right.","Reasoning"],
 ["Passage: A bank cut fees and later saw more accounts opened. A rival also closed nearby that month. Which inference is justified?","The fee cut alone caused all new accounts.","The rival closure had no effect.","The account increase cannot be attributed solely to the fee cut from this evidence.","Fees never affect customer decisions.","C","Two changes occurred together, so this evidence cannot isolate the fee cut as the sole cause.","English"],
 ["The difference between compound and simple interest on a sum for 2 years at 8% per year is 64. Find the principal.","8000","10000","12000","16000","B","For 2 years the difference is P(8/100) squared. Thus P = 64/0.0064 = 10000.","Quantitative Aptitude"],
 ["Find the next term: 3, 10, 32, 99, 301, __.","904","905","908","910","C","Multiply by 3 and add successive integers: +1,+2,+3,+4,+5. Next = 301 x 3 + 5 = 908.","Reasoning"]
]'::jsonb),
('ibps', 10, '[
 ["A bag has 4 red and 5 blue balls. Three balls are drawn without replacement. Given at least one is red, find the probability exactly two are red.","15/37","5/14","3/7","20/37","A","There are C(9,3)-C(5,3)=84-10=74 eligible selections. Exactly two reds: C(4,2)C(5,1)=30; 30/74=15/37.","Quantitative Aptitude"],
 ["Eight people A to H face north in a row. A is at the left end, H at the right end; D is fourth; B is immediately left of C and left of D; F is immediately right of E; G is right of F. Who is sixth?","E","F","G","C","B","B is left of D, so B C fill seats 2,3. E F G then fill seats 5,6,7. F is sixth.","Reasoning"],
 ["Passage: A model flags more fraudulent transactions than its predecessor but also flags twice as many legitimate transactions. Which conclusion is best supported?","The new model is superior on every metric.","The new model trades increased detection for more false positives.","All flagged transactions are fraudulent.","The predecessor detects no fraud.","B","Detection improved, but legitimate transactions flagged in error also increased; the evidence establishes a trade-off, not unconditional superiority.","English"],
 ["A branch processed 20% more requests in February than January. Its rejection rate fell from 25% to 20%. By what percentage did accepted requests increase?","20%","24%","28%","32%","C","Let January requests be 100: accepted = 75. February requests = 120: accepted = 96. Increase = 21/75 x 100 = 28%.","Quantitative Aptitude"],
 ["Compare x and y: x squared - 14x + 48 = 0; y squared - 16y + 63 = 0.","x > y always","x < y always","x = y always","No single relation holds for all roots","D","x is 6 or 8, y is 7 or 9. x=8,y=7 gives x>y, but x=6,y=9 gives x<y.","Reasoning"]
]'::jsonb)
)
insert into public.questions (
  exam_id, position, question_text, options, correct_option_id, explanation, topic
)
select
  ('21000000-0000-0000-' || lpad(s.level::text, 4, '0') || '-' ||
    case when s.exam = 'ssc' then '000000000001' else '000000000002' end)::uuid,
  q.position::integer,
  q.item->>0,
  jsonb_build_array(
    jsonb_build_object('id', 'A', 'text', q.item->>1),
    jsonb_build_object('id', 'B', 'text', q.item->>2),
    jsonb_build_object('id', 'C', 'text', q.item->>3),
    jsonb_build_object('id', 'D', 'text', q.item->>4)
  ),
  q.item->>5, q.item->>6, q.item->>7
from sets s
cross join lateral jsonb_array_elements(s.items) with ordinality q(item, position);

alter function public.get_catalog() rename to get_catalog_without_levels;
revoke all on function public.get_catalog_without_levels() from public, anon, authenticated;

create function public.get_catalog()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(
    item || jsonb_build_object(
      'series_id', e.series_id,
      'level', e.level,
      'completed', best.id is not null,
      'best_score', best.score,
      'latest_score', latest.score,
      'latest_result_id', latest.id,
      'unlocked', not exists (
        select 1 from generate_series(1, e.level - 1) previous(level)
        where not exists (
          select 1 from public.exams prerequisite
          join public.submissions s on s.exam_id = prerequisite.id and s.user_id = auth.uid()
          where prerequisite.series_id = e.series_id and prerequisite.level = previous.level
        )
      )
    ) order by e.series_id, e.level
  ), '[]'::jsonb)
  from jsonb_array_elements(public.get_catalog_without_levels()) item
  join public.exams e on e.id = (item->>'id')::uuid
  left join lateral (
    select s.id, s.score from public.submissions s
    where s.exam_id = e.id and s.user_id = auth.uid()
    order by s.score desc, s.time_taken_seconds, s.submitted_at, s.id limit 1
  ) best on true
  left join lateral (
    select s.id, s.score from public.submissions s
    where s.exam_id = e.id and s.user_id = auth.uid()
    order by s.submitted_at desc, s.id desc limit 1
  ) latest on true;
$$;

alter function public.start_exam(uuid) rename to start_exam_without_levels;
revoke all on function public.start_exam_without_levels(uuid) from public, anon, authenticated;

create function public.start_exam(p_exam_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_exam public.exams%rowtype;
begin
  if auth.uid() is null then
    raise exception using errcode = '28000', message = 'Sign in to start a test.';
  end if;
  select * into v_exam from public.exams where id = p_exam_id and is_published;
  if not found then
    raise exception using errcode = 'P0002', message = 'This mock test is not available.';
  end if;
  if exists (
    select 1 from generate_series(1, v_exam.level - 1) previous(level)
    where not exists (
      select 1 from public.exams prerequisite
      join public.submissions s on s.exam_id = prerequisite.id and s.user_id = auth.uid()
      where prerequisite.series_id = v_exam.series_id and prerequisite.level = previous.level
    )
  ) then
    raise exception using errcode = '42501', message = 'Complete all earlier levels of this exam before starting this level.';
  end if;
  return public.start_exam_without_levels(p_exam_id);
end;
$$;

alter function public.get_result(uuid) rename to get_result_without_levels;
revoke all on function public.get_result_without_levels(uuid) from public, anon, authenticated;
create function public.get_result(p_submission_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select result || jsonb_build_object(
    'level', e.level, 'series_id', e.series_id,
    'exam_title', e.title || ' · Level ' || e.level
  )
  from public.get_result_without_levels(p_submission_id) result
  join public.exams e on e.id = (result->>'exam_id')::uuid;
$$;

alter function public.get_dashboard() rename to get_dashboard_without_levels;
revoke all on function public.get_dashboard_without_levels() from public, anon, authenticated;
create function public.get_dashboard()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_set(dashboard, '{history}', coalesce((
    select jsonb_agg(
      item || jsonb_build_object('level', e.level, 'exam_title', e.title || ' · Level ' || e.level)
      order by position
    )
    from jsonb_array_elements(dashboard->'history') with ordinality h(item, position)
    join public.exams e on e.id = (item->>'exam_id')::uuid
  ), '[]'::jsonb))
  from public.get_dashboard_without_levels() dashboard;
$$;

revoke all on function public.get_catalog() from public;
revoke all on function public.start_exam(uuid) from public;
revoke all on function public.get_result(uuid) from public;
revoke all on function public.get_dashboard() from public;
grant execute on function public.get_catalog() to anon, authenticated;
grant execute on function public.start_exam(uuid) to authenticated;
grant execute on function public.get_result(uuid) to authenticated;
grant execute on function public.get_dashboard() to authenticated;

notify pgrst, 'reload schema';
commit;
