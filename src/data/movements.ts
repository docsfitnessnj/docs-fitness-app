// THE MOVEMENT VAULT — starter data.
//
// One entry per movement Doc's crew actually uses across the 54 Deck of WODs
// cards and the weekly WODs. Everything here is a scaffold:
//   - `video` is `null` for almost every entry — drop in a real YouTube ID
//     (or a self-hosted source, see MovementVideoSource below) and it starts
//     showing up as a tappable link everywhere the movement's name appears.
//   - `cues` are generic starter coaching points, not Doc's own words yet —
//     swap them for the real cueing you use in class. Cues are searched
//     along with the name, so keep them short and keyword-rich.
//   - `aliases` are the different ways this movement's name shows up in the
//     card/WOD text (varied capitalization, abbreviations, "Single Arm" vs
//     "H2H", etc.) — add more here any time a new phrasing shows up in a
//     card and the name isn't lighting up as tappable.
//
// This file is the ONLY place movement content lives — the vault list, the
// detail view, and every tappable movement name across WODs/Deck/COWS all
// read from MOVEMENTS.

// Discriminated union so a self-hosted video source can be added later
// (e.g. `{ type: 'selfHosted'; url: string }`) without touching anything
// that consumes it — MovementVideoPlayer is the only place that switches on
// `type`.
export type MovementVideoSource = { type: 'youtube'; youtubeId: string };

export type Movement = {
  id: string;
  name: string;
  aliases: string[];
  video: MovementVideoSource | null;
  cues: string[];
};

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

type MovementSeed = Omit<Movement, 'id'>;

const SEEDS: MovementSeed[] = [
  {
    name: 'Kettlebell Swing',
    aliases: [
      'Swing',
      'Swings',
      'Kettlebell Swings',
      'H2H Swings',
      'Cali Swings',
      'Single Arm Swing',
      'Single Arm Swings',
      'Single A. Swings',
      'Side Step Swings',
      'Kickstand Swings',
      'Double Swings',
      'Heavier Swings',
    ],
    // A real example so the vault has one working link end to end — swap
    // this for your own footage whenever you're ready.
    video: { type: 'youtube', youtubeId: 'PAhDt_0PjP4' },
    cues: [
      'Hinge at the hips, don’t squat it.',
      'Snap the hips, float the arms.',
      'Keep the bell close on the backswing.',
      'Stand tall and squeeze the glutes at the top.',
    ],
  },
  {
    name: 'Kettlebell Clean',
    aliases: [
      'Clean',
      'Cleans',
      'Double Clean',
      'Double Cleans',
      'Dead Clean',
      'Dead Cleans',
      'Alt. Dead Clean',
      'Alternating Cleans',
      'Holster Cleans',
      'Goblet Clean',
    ],
    video: null,
    cues: [
      'Keep the bell close to the body the whole way up.',
      'Let the handle roll around the hand, don’t muscle it.',
      'Catch it soft in the rack — no banging on the wrist.',
    ],
  },
  {
    name: 'Kettlebell Snatch',
    aliases: ['Snatch', 'Snatches', 'Dead Snatches', 'Double Snatches', 'R-Snatches', 'L-Snatches', 'Kettlebell Snatches'],
    video: null,
    cues: [
      'Punch through at the top, don’t press it out.',
      'Vertical forearm, bell floats past the wrist.',
      'Same hinge and snap as the swing underneath it.',
    ],
  },
  {
    name: 'Clean & Press',
    aliases: ['Clean & Press', 'Clean and Press', 'Clean &amp; Press', 'Tactical C&S'],
    video: null,
    cues: ['Clean it clean, then press it strict.', 'Brace the core before every press.', 'Lock out overhead, stack the wrist over the shoulder.'],
  },
  {
    name: 'Push Press',
    aliases: ['Push Press', 'Push-Press', 'Goblet Push Press', 'HB Presses'],
    video: null,
    cues: ['Short dip, straight up — no forward lean.', 'Drive with the legs, finish with the arms.', 'Land soft, reset before the next rep.'],
  },
  {
    name: 'Turkish Get-Up',
    aliases: ['TGU', 'TGD', 'Turkish Getup', 'Turkish Get-Up', 'Turkish Get Down', 'Sit Thru Getups'],
    video: null,
    cues: ['Eyes on the bell the entire rep.', 'Punch it straight up, keep the arm locked.', 'Slow and controlled — this one isn’t for time.'],
  },
  {
    name: 'Goblet Squat',
    aliases: [
      'Goblet Squat',
      'Goblet Squats',
      'Goblet Clean + Goblet Squat',
      '"Kurtzy" Squats',
      'Kurtzy Squats',
      'Shot-put Clean & Squat',
      'Shot-Put Squats',
      'Goblet Curl',
      'Goblet Split Squats',
    ],
    video: null,
    cues: ['Elbows drive between the knees.', 'Chest up, weight through the whole foot.', 'Sit down, not just back.'],
  },
  {
    name: 'Offset Squat',
    aliases: ['Offset Squats', 'Offset Split Squats', 'Racked Squats', 'Anchor Squats', 'Deck Squats', 'Backpack squats', 'Surfer Squats'],
    video: null,
    cues: ['Fight the pull to one side — brace the core.', 'Same depth and tempo on both sides.'],
  },
  {
    name: 'Thruster',
    aliases: ['Offset Thruster', 'Offset Thrusters', 'Racked Thrusters', 'Goblet Thrusters'],
    video: null,
    cues: ['One smooth motion from squat to press.', 'Use the leg drive to help the press, not your shoulders alone.'],
  },
  {
    name: 'Reverse Lunge',
    aliases: [
      'Lunges',
      'Offset Reverse Lunge',
      'Goblet Reverse Lunge',
      'Goblet Reverse Lunges',
      'Farmer Reverse Lunges',
      'Backpack Reverse Lunges',
      'Racked Forward Lunges',
      'Devil Lunges',
      'Rev. Lg + KD',
      'Reverse Lunge + Knee Drive',
    ],
    video: null,
    cues: ['Step back, drop the back knee straight down.', 'Front shin stays vertical.', 'Push through the front heel to stand.'],
  },
  {
    name: 'Jump Lunge',
    aliases: ['Jump Lunges', 'Jump Lunge Squats'],
    video: null,
    cues: ['Land soft, absorb through the hips and knees.', 'Switch legs cleanly in the air.'],
  },
  {
    name: 'Gorilla Row',
    aliases: ['Gorilla Rows', 'Bent Row', 'Bent Rows', 'Bent rows', 'Hinge Rows', 'Staggered Rows', 'Ballistic Rows'],
    video: null,
    cues: ['Hinge and hold — don’t let the hips rise and fall with each rep.', 'Pull with the elbow, not the hand.', 'Flat back the whole set.'],
  },
  {
    name: 'Pull-Thru',
    aliases: ['Pull Thru', 'Pull Thrus', 'Pull Throughs', 'Pull Thru Pushups', 'Pull Thru Murphs', 'Elevator Pull Thru', 'Bear Pull Thrus'],
    video: null,
    cues: ['Rotate through the torso, reach fully under.', 'Keep the hips low and stacked.'],
  },
  {
    name: 'Pull-Up',
    aliases: ['Pull-up', 'Pull-ups', 'Pull-Ups', 'Chin-ups', 'Pull-up Practice'],
    video: null,
    cues: ['Full hang at the bottom, chin over the bar at the top.', 'Squeeze the shoulder blades down and back to start the pull.'],
  },
  {
    name: 'TRX Row',
    aliases: ['TRX', 'TRX Rows'],
    video: null,
    cues: ['Body stays in one straight line.', 'Pull the chest to your hands, elbows tight.'],
  },
  {
    name: 'Kneeling Pull',
    aliases: ['Kneeling Pulls', 'Rollouts'],
    video: null,
    cues: ['Brace the core before you move.', 'Control the negative just as much as the pull.'],
  },
  {
    name: 'Suitcase Deadlift',
    aliases: ['Suitcase Dead', 'Suitcase Deads', 'Suitcase Carry/March', 'Suitcase One Legged Marches'],
    video: null,
    cues: ['Resist leaning toward the loaded side.', 'Hinge, don’t squat, to pick it up.'],
  },
  {
    name: 'Farmer Carry',
    aliases: ['Farmer Carries', 'Farmer Deads', 'Farmer Marches', 'Racked Marches', 'Goblet Marches'],
    video: null,
    cues: ['Shoulders packed, ribs stacked over hips.', 'Walk tall — don’t let the bells pull you side to side.'],
  },
  {
    name: 'Single Leg Deadlift',
    aliases: ['Single Leg Deads', 'Kickstand Deads', 'Sumo Deads', 'Heavy Deads'],
    video: null,
    cues: ['Hinge from the hip of the standing leg.', 'Keep the hips square to the floor.'],
  },
  {
    name: 'Push-Up',
    aliases: ['Pushups', 'Push-Ups', 'Bear Squat Pushups', 'Yoga Pushups', 'Offset Pushups'],
    video: null,
    cues: ['Straight line from head to heels.', 'Elbows at about 45 degrees, not flared to 90.'],
  },
  {
    name: 'Elevator',
    aliases: ['Elevators', 'Escalators'],
    video: null,
    cues: ['Controlled up, controlled down — no bouncing.'],
  },
  {
    name: 'Hollow Body Hold',
    aliases: ['Hollow Body Knee 2 Bow', 'Hollow Body Knee to Bow', 'Hollow Body Plank', 'Hollow Body Crunches', 'Hollow Body Hold'],
    video: null,
    cues: ['Low back stays pressed into the floor.', 'Squeeze the whole body, not just the abs.'],
  },
  {
    name: 'Low Plank',
    aliases: [
      'Low Plank',
      'Low Plank Hip Taps',
      'Low Plank Knee2Bow',
      'Low Plank Knee To Bow',
      'Low Plank Knee 2 Elbow',
      'Up Down Planks',
      'Up / Down Planks',
    ],
    video: null,
    cues: ['Forearms stacked under the shoulders.', 'Squeeze the glutes to keep the hips level.'],
  },
  {
    name: 'V-Up',
    aliases: ['Alt. V-ups', 'Alt V-Ups', 'Alternating V-ups', '3-Way V-ups', 'V-Sit', 'Boat Pose'],
    video: null,
    cues: ['Reach hands to toes, lead with the chest.', 'Keep the low back off the floor at the bottom.'],
  },
  {
    name: 'Sit-Up',
    aliases: ['Sit-Ups', 'Seal Sit-ups', 'Sit Thrus'],
    video: null,
    cues: ['Exhale on the way up.', 'Keep the feet grounded or anchored.'],
  },
  {
    name: 'Shoulder Tap',
    aliases: ['Shoulder Taps', 'Skater Taps', 'Hip Taps'],
    video: null,
    cues: ['Keep the hips as still as possible while you tap.', 'Wide base with the feet for stability.'],
  },
  {
    name: 'Dead Hang',
    aliases: ['Dead Hang'],
    video: null,
    cues: ['Relax the shoulders into a full hang.', 'Breathe — don’t hold your breath through it.'],
  },
  {
    name: 'Bear Squat Hop',
    aliases: ['Bear squat hops', 'Bear Squat Hops'],
    video: null,
    cues: ['Soft, quiet landings.', 'Stay low and athletic between hops.'],
  },
  {
    name: 'Burpee',
    aliases: ['Burpees', 'Straight Arm Burpees', 'Burpee Bell Hops', 'Max Burpees'],
    video: null,
    cues: ['Chest to the floor, full lockout at the top.', 'Find a pace you can hold, not just sprint the first five.'],
  },
  {
    name: 'Assault Bike',
    aliases: ['Assault Bike', 'Assault Bikes', 'Erg', 'Sled'],
    video: null,
    cues: ['Drive evenly with the arms and legs together.', 'Pace it — it rewards patience, punishes red-lining early.'],
  },
  {
    name: 'Box Jump',
    aliases: ['Box Jumps', 'Frog Jumps', 'KB Jump Squats'],
    video: null,
    cues: ['Land with the hips, not just the toes.', 'Step down — don’t jump down.'],
  },
  {
    name: 'Wall Ball',
    aliases: ['Wall Balls'],
    video: null,
    cues: ['Squat to full depth before the throw.', 'Catch it and flow straight back into the next squat.'],
  },
  {
    name: 'Toes-to-Bar',
    aliases: ['Toes-to-Bar'],
    video: null,
    cues: ['Drive from the shoulders and lats, not just the abs.', 'Control the swing between reps.'],
  },
  {
    name: 'Run',
    aliases: ['Run', '200m Run', '400m Run'],
    video: null,
    cues: ['Relaxed shoulders, quick cadence.'],
  },
  {
    name: 'Windmill',
    aliases: ['1/2 Kneeling Windmill', 'Standing Windmill'],
    video: null,
    cues: ['Eyes on the bell overhead the whole rep.', 'Hinge, don’t bend, at the waist.'],
  },
  {
    name: 'Gunslinger',
    aliases: ['Gunslingers'],
    video: null,
    cues: ['Smooth hand-to-hand transfer at the top.'],
  },
  {
    name: 'Kettlebell Pullover',
    aliases: ['Can Opener Pullovers', 'KB Pull-Overs'],
    video: null,
    cues: ['Keep the ribs down as the arms lower overhead.'],
  },
  {
    name: 'Kettlebell Flow',
    aliases: ['Kettlebell Flow', 'Figure 8', 'Carry Variation', 'Plank Variation', 'S2S', 'Swing To Snatches'],
    video: null,
    cues: ['Let one movement flow into the next — no dead stops.', 'Slow it down until the transitions feel clean.'],
  },
];

export const MOVEMENTS: Movement[] = SEEDS.map((seed) => ({ id: slugify(seed.name), ...seed }));

export function getMovementById(id: string): Movement | undefined {
  return MOVEMENTS.find((m) => m.id === id);
}

// Matches the vault's search bar against name, aliases, and cues (so
// searching a cue term like "hinge" surfaces every movement that mentions
// it, not just exact name matches).
export function searchMovements(query: string): Movement[] {
  const q = query.trim().toLowerCase();
  if (!q) return MOVEMENTS;
  return MOVEMENTS.filter(
    (m) =>
      m.name.toLowerCase().includes(q) ||
      m.aliases.some((a) => a.toLowerCase().includes(q)) ||
      m.cues.some((c) => c.toLowerCase().includes(q))
  );
}
