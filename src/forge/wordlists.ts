// Password Forge word lists. Small on purpose: a real cracker's lists hold millions of leaked
// passwords and every word in every language. The estimator models that with flat tiers (see
// estimator.ts), so these lists only need to cover what players are likely to type.

// Ordered by how often they appear in public breach compilations; rank = guesses needed.
export const COMMON_PASSWORDS: readonly string[] = [
  "123456", "password", "123456789", "12345678", "12345", "qwerty", "1234567", "111111", "1234567890", "123123",
  "abc123", "1234", "password1", "iloveyou", "1q2w3e4r", "000000", "qwerty123", "zaq12wsx", "dragon", "sunshine",
  "princess", "letmein", "654321", "monkey", "1qaz2wsx", "123321", "qwertyuiop", "superman", "asdfghjkl", "trustno1",
  "football", "baseball", "welcome", "admin", "master", "shadow", "michael", "jennifer", "charlie", "starwars",
  "whatever", "freedom", "batman", "passw0rd", "hello", "login", "secret", "flower", "loveme", "zaq1zaq1",
  "ninja", "mustang", "access", "696969", "qazwsx", "liverpool", "chelsea", "arsenal", "pokemon", "computer",
  "cheese", "summer", "winter", "killer", "pepper", "jordan", "ginger", "buster", "soccer", "hockey",
  "ranger", "daniel", "thomas", "robert", "andrew", "harley", "joshua", "matthew", "maggie", "7777777",
  "987654321", "888888", "666666", "121212", "112233", "google", "internet", "samsung", "family", "purple",
  "orange", "banana", "cookie", "chocolate", "angel", "blink182", "babygirl", "lovely", "nicole", "jessica",
  "ashley", "tigger", "hannah", "password123", "admin123", "welcome1", "changeme", "qwe123", "abcd1234", "asdf",
];

// The "top few thousand words" tier: everyday words, names, months, seasons, sports, pets.
// Deliberately leaves out the less common words used in the game's example passphrases, which
// fall into the "any dictionary word" tier instead.
export const COMMON_WORDS: readonly string[] = (
  "i a an the and or of to in on at by for my me we you he she it is am are was be do go no so up us " +
  "love like hate life live home house work time year day night week month today happy sad good bad best " +
  "big small little old new young hot cold blue red green black white pink gold silver yellow brown grey gray " +
  "cat dog dogs cats fish bird horse cow pig duck bear lion tiger wolf fox mouse rabbit snake eagle shark puppy kitty " +
  "sun moon star stars sky rain snow wind fire water earth tree trees flower rose lily sea ocean river lake " +
  "spring autumn fall january february march april may june july august september october november december " +
  "monday tuesday wednesday thursday friday saturday sunday " +
  "john james david mark paul peter anna maria emma sarah laura chris alex sam max ben tom jack lucy kate mike " +
  "king queen prince boss baby girl boy man woman mother father mom dad sister brother friend friends " +
  "money cash bank card car cars bike road city town street park school college team club game games play player " +
  "music song rock metal jazz dance party movie film book books phone computer apple orange lemon cherry " +
  "coffee tea beer wine pizza cake candy sugar honey salt bread butter " +
  "football soccer tennis golf hockey rugby cricket basketball baseball " +
  "red blue magic power super hero heroes star war wars dark light shadow ghost angel devil god heaven hell " +
  "secret private pass word words key keys lock door open close login user admin test guest demo " +
  "one two three four five six seven eight nine ten hundred thousand first last " +
  "hello welcome thanks please sorry yes yeah okay cool nice great sweet crazy funny lucky " +
  "summer winter sunshine rainbow forever always never together heart kiss smile dream dreams hope faith " +
  "correct horse battery staple company office mail email online web net internet " +
  "blue sky green grass black cat white snow north south east west " +
  "london paris berlin rome madrid tokyo texas london york " +
  "iloveyou ilove you mine yours ours"
)
  .split(/\s+/)
  .filter(Boolean);

// Fictional breach dumps for the reuse lesson. Not real data.
export const BREACHES: readonly { password: string; source: string }[] = [
  { password: "Tundra7&Kettle!Mosaic", source: "ShopNest breach (fictional, 2025)" },
  { password: "Blue$Heron!Quarry42", source: "FitTrackr breach (fictional, 2024)" },
  { password: "maple-Otter#Sofa-19", source: "ShopNest breach (fictional, 2025)" },
];
