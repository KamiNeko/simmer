// The demo household's recipes for the README screenshots.

const i = (quantity, unit, name, note = "", extra = {}) => ({ quantity, unit, name, note, ...extra });

export const RECIPES = [
  {
    dish: "gochujang-chicken-meal-prep",
    title: "Gochujang Chicken Meal Prep",
    description: "Sweet, spicy and sticky chicken thighs over rice. Keeps well for lunches all week.",
    source_url: "https://example.com/gochujang-chicken",
    servings: 4,
    prep_minutes: 15,
    cook_minutes: 25,
    total_minutes: 40,
    tags: ["Korean", "Meal prep"],
    groups: [
      { name: "", ingredients: [i(900, "g", "chicken thigh", "boneless, skinless"), i(400, "g", "rice", "uncooked"), i(3, "piece", "green onion", "sliced")] },
      { name: "Marinade", ingredients: [i(2, "tbsp", "soy sauce"), i(3, "clove", "garlic", "minced"), i(1, "tsp", "ginger", "grated")] },
      { name: "Sauce", ingredients: [i(3, "tbsp", "gochujang"), i(2, "tbsp", "honey"), i(1, "tbsp", "rice vinegar"), i(1, "tsp", "sesame oil"), i(null, null, "sesame seeds", "for garnish")] },
    ],
    steps: [
      { section: "Marinate", text: "Cut the chicken into 3 cm pieces and toss with the marinade. Rest for 20 minutes while the rice cooks." },
      { section: "Cook", text: "Heat a large pan over high heat and sear the chicken until browned, about 6 minutes." },
      { section: "Cook", text: "Whisk the sauce ingredients, pour over the chicken and cook until sticky and glossy, 3 to 4 minutes." },
      { section: "Serve", text: "Divide rice and chicken between 4 containers. Top with green onion and sesame seeds." },
    ],
  },
  {
    dish: "shakshuka",
    title: "Shakshuka",
    description: "Eggs poached in a spiced tomato and pepper sauce. Bring the pan to the table with good bread.",
    servings: 2,
    prep_minutes: 10,
    cook_minutes: 25,
    total_minutes: 35,
    tags: ["Breakfast", "Vegetarian"],
    groups: [
      {
        name: "",
        ingredients: [
          i(2, "tbsp", "olive oil"), i(1, "piece", "onion", "diced"), i(1, "piece", "red bell pepper", "diced"), i(3, "clove", "garlic", "sliced"),
          i(1, "tsp", "ground cumin"), i(1, "tsp", "smoked paprika"), i(800, "g", "canned tomatoes", "crushed"), i(4, "piece", "eggs"),
          i(null, null, "feta", "crumbled, to serve"), i(1, "bunch", "parsley", "chopped"),
        ],
      },
    ],
    steps: [
      { section: "Sauce", text: "Warm the oil in a 28 cm pan and soften the onion and pepper for 8 minutes." },
      { section: "Sauce", text: "Add garlic and spices for 1 minute, then the tomatoes. Simmer for 10 minutes until thick." },
      { section: "Eggs", text: "Make 4 wells and crack in the eggs. Cover and cook on low for 6 to 8 minutes, until the whites are set." },
      { section: "Eggs", text: "Scatter feta and parsley over the top and serve from the pan." },
    ],
  },
  {
    dish: "kimchi-fried-rice",
    title: "Kimchi Fried Rice",
    description: "The best use for yesterday's rice. Ready in 15 minutes.",
    servings: 2,
    total_minutes: 15,
    tags: ["Korean", "Quick"],
    groups: [{ name: "", ingredients: [i(300, "g", "cooked rice", "day-old"), i(150, "g", "kimchi", "chopped"), i(2, "tbsp", "kimchi juice"), i(1, "tbsp", "gochujang"), i(2, "piece", "eggs"), i(2, "piece", "green onion")] }],
    steps: [
      { section: "", text: "Fry the kimchi in a little oil for 2 minutes. Add the rice, kimchi juice and gochujang and fry until crisp in places." },
      { section: "", text: "Top each bowl with a fried egg and sliced green onion." },
    ],
  },
  {
    dish: "mushroom-risotto",
    title: "Mushroom Risotto",
    description: "Creamy risotto with browned mushrooms and parmesan.",
    servings: 4,
    total_minutes: 45,
    tags: ["Italian", "Vegetarian"],
    groups: [
      { name: "", ingredients: [i(320, "g", "arborio rice"), i(1.2, "l", "vegetable stock", "hot"), i(1, "piece", "shallot", "finely chopped"), i(120, "ml", "dry white wine"), i(50, "g", "parmesan", "grated"), i(30, "g", "butter")] },
      { name: "Mushrooms", ingredients: [i(400, "g", "chestnut mushrooms", "sliced"), i(2, "clove", "garlic"), i(1, "tsp", "thyme leaves")] },
    ],
    steps: [
      { section: "", text: "Brown the mushrooms in batches with garlic and thyme. Set aside." },
      { section: "", text: "Soften the shallot, stir in the rice for 1 minute, then add the wine." },
      { section: "", text: "Add the stock a ladle at a time, stirring, for 18 to 20 minutes. Finish with butter, parmesan and the mushrooms." },
    ],
  },
  {
    dish: "lemon-herb-salmon",
    title: "Lemon Herb Salmon with Potatoes",
    description: "One tray, 30 minutes.",
    servings: 2,
    total_minutes: 30,
    tags: ["Fish", "Quick"],
    groups: [{ name: "", ingredients: [i(2, "piece", "salmon fillets"), i(500, "g", "baby potatoes", "halved"), i(1, "piece", "lemon"), i(2, "tbsp", "olive oil"), i(1, "bunch", "dill")] }],
    steps: [
      { section: "", text: "Roast the potatoes at 220 °C for 15 minutes." },
      { section: "", text: "Add the salmon with lemon slices and dill and roast 12 minutes more." },
    ],
  },
  {
    dish: "thai-green-curry",
    title: "Thai Green Curry",
    description: "Fragrant coconut curry with chicken and Thai basil.",
    servings: 4,
    total_minutes: 30,
    tags: ["Thai"],
    groups: [{ name: "", ingredients: [i(3, "tbsp", "green curry paste"), i(400, "ml", "coconut milk"), i(500, "g", "chicken breast"), i(1, "piece", "aubergine"), i(1, "tbsp", "fish sauce"), i(1, "bunch", "Thai basil")] }],
    steps: [
      { section: "", text: "Fry the curry paste in a splash of coconut milk until fragrant." },
      { section: "", text: "Add the rest of the coconut milk, chicken and aubergine. Simmer 15 minutes and season with fish sauce." },
    ],
  },
  {
    dish: "banana-bread",
    title: "Classic Banana Bread",
    description: "An American recipe in cups. Switch to metric to bake it with a scale.",
    servings: 10,
    prep_minutes: 15,
    cook_minutes: 60,
    total_minutes: 75,
    tags: ["Baking"],
    groups: [
      {
        name: "",
        ingredients: [
          i(3, "piece", "ripe bananas", "mashed"), i(0.33, "cup", "butter", "melted", { grams_per_ml: 0.96 }), i(0.75, "cup", "sugar", "", { grams_per_ml: 0.85 }),
          i(1, "piece", "egg"), i(1, "tsp", "vanilla extract"), i(1, "tsp", "baking soda"), i(1.5, "cup", "flour", "", { grams_per_ml: 0.53 }),
        ],
      },
    ],
    steps: [
      { section: "", text: "Heat the oven to 350 °F and butter a 4x8 inch loaf pan." },
      { section: "", text: "Mix the bananas, butter, sugar, egg and vanilla. Stir in the baking soda and flour." },
      { section: "", text: "Bake for 55 to 65 minutes, until a skewer comes out clean." },
    ],
  },
  {
    dish: "greek-salad",
    title: "Greek Salad",
    description: "Crunchy, salty and fresh.",
    servings: 2,
    total_minutes: 10,
    tags: ["Vegetarian", "Quick"],
    groups: [{ name: "", ingredients: [i(3, "piece", "tomatoes"), i(1, "piece", "cucumber"), i(0.5, "piece", "red onion"), i(100, "g", "feta"), i(12, "piece", "kalamata olives"), i(2, "tbsp", "olive oil")] }],
    steps: [{ section: "", text: "Chop, combine, dress with oil and a pinch of oregano." }],
  },
];
