export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      added_sugar_ingredients: {
        Row: {
          fraction: number
          ingredient_id: number
          note: string | null
        }
        Insert: {
          fraction?: number
          ingredient_id: number
          note?: string | null
        }
        Update: {
          fraction?: number
          ingredient_id?: number
          note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "added_sugar_ingredients_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: true
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
        ]
      }
      admins: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      allergens: {
        Row: {
          id: number
          name: string
          slug: string
        }
        Insert: {
          id?: never
          name: string
          slug: string
        }
        Update: {
          id?: never
          name?: string
          slug?: string
        }
        Relationships: []
      }
      cookware: {
        Row: {
          id: number
          name: string
          slug: string
        }
        Insert: {
          id?: never
          name: string
          slug: string
        }
        Update: {
          id?: never
          name?: string
          slug?: string
        }
        Relationships: []
      }
      cuisines: {
        Row: {
          id: number
          name: string
          slug: string
        }
        Insert: {
          id?: never
          name: string
          slug: string
        }
        Update: {
          id?: never
          name?: string
          slug?: string
        }
        Relationships: []
      }
      diets: {
        Row: {
          id: number
          name: string
          slug: string
        }
        Insert: {
          id?: never
          name: string
          slug: string
        }
        Update: {
          id?: never
          name?: string
          slug?: string
        }
        Relationships: []
      }
      favorites: {
        Row: {
          created_at: string
          recipe_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          recipe_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          recipe_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "nutrition_calorie_check"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          enabled: boolean
          name: string
        }
        Insert: {
          enabled?: boolean
          name: string
        }
        Update: {
          enabled?: boolean
          name?: string
        }
        Relationships: []
      }
      fridge_items: {
        Row: {
          added_on: string
          created_at: string
          expires_on: string | null
          id: string
          ingredient_id: number
          notes: string | null
          purchased_on: string | null
          quantity: string | null
          user_id: string
        }
        Insert: {
          added_on?: string
          created_at?: string
          expires_on?: string | null
          id?: string
          ingredient_id: number
          notes?: string | null
          purchased_on?: string | null
          quantity?: string | null
          user_id: string
        }
        Update: {
          added_on?: string
          created_at?: string
          expires_on?: string | null
          id?: string
          ingredient_id?: number
          notes?: string | null
          purchased_on?: string | null
          quantity?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fridge_items_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fridge_items_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ingredient_aliases: {
        Row: {
          alias: string
          alias_norm: string | null
          id: number
          ingredient_id: number
        }
        Insert: {
          alias: string
          alias_norm?: string | null
          id?: never
          ingredient_id: number
        }
        Update: {
          alias?: string
          alias_norm?: string | null
          id?: never
          ingredient_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "ingredient_aliases_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
        ]
      }
      ingredient_allergens: {
        Row: {
          allergen_id: number
          basis: string
          ingredient_id: number
          reason: string | null
        }
        Insert: {
          allergen_id: number
          basis?: string
          ingredient_id: number
          reason?: string | null
        }
        Update: {
          allergen_id?: number
          basis?: string
          ingredient_id?: number
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ingredient_allergens_allergen_id_fkey"
            columns: ["allergen_id"]
            isOneToOne: false
            referencedRelation: "allergens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingredient_allergens_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
        ]
      }
      ingredient_assumptions: {
        Row: {
          ingredient_id: number
          note: string
        }
        Insert: {
          ingredient_id: number
          note: string
        }
        Update: {
          ingredient_id?: number
          note?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingredient_assumptions_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: true
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
        ]
      }
      ingredient_foods: {
        Row: {
          fdc_id: number
          form: string
          ingredient_id: number
          is_default: boolean
        }
        Insert: {
          fdc_id: number
          form?: string
          ingredient_id: number
          is_default?: boolean
        }
        Update: {
          fdc_id?: number
          form?: string
          ingredient_id?: number
          is_default?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "ingredient_foods_fdc_id_fkey"
            columns: ["fdc_id"]
            isOneToOne: false
            referencedRelation: "usda_foods"
            referencedColumns: ["fdc_id"]
          },
          {
            foreignKeyName: "ingredient_foods_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
        ]
      }
      ingredient_modifiers: {
        Row: {
          position: string
          word: string
        }
        Insert: {
          position?: string
          word: string
        }
        Update: {
          position?: string
          word?: string
        }
        Relationships: []
      }
      ingredient_portions: {
        Row: {
          form: string
          grams_per_unit: number
          id: number
          ingredient_id: number
          note: string | null
          source: string
          unit_id: number | null
        }
        Insert: {
          form?: string
          grams_per_unit: number
          id?: never
          ingredient_id: number
          note?: string | null
          source: string
          unit_id?: number | null
        }
        Update: {
          form?: string
          grams_per_unit?: number
          id?: never
          ingredient_id?: number
          note?: string | null
          source?: string
          unit_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ingredient_portions_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ingredient_portions_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      ingredient_shelf_life: {
        Row: {
          days: number
          ingredient_id: number
          note: string | null
        }
        Insert: {
          days: number
          ingredient_id: number
          note?: string | null
        }
        Update: {
          days?: number
          ingredient_id?: number
          note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ingredient_shelf_life_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: true
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
        ]
      }
      ingredients: {
        Row: {
          aisle_category: string
          canonical_name: string
          created_at: string
          density_g_per_ml: number | null
          diet_class: string | null
          family_id: number | null
          fdc_id: number | null
          filter_group: string | null
          id: number
          is_pantry_staple: boolean
          name_norm: string | null
          slug: string
        }
        Insert: {
          aisle_category: string
          canonical_name: string
          created_at?: string
          density_g_per_ml?: number | null
          diet_class?: string | null
          family_id?: number | null
          fdc_id?: number | null
          filter_group?: string | null
          id?: never
          is_pantry_staple?: boolean
          name_norm?: string | null
          slug: string
        }
        Update: {
          aisle_category?: string
          canonical_name?: string
          created_at?: string
          density_g_per_ml?: number | null
          diet_class?: string | null
          family_id?: number | null
          fdc_id?: number | null
          filter_group?: string | null
          id?: never
          is_pantry_staple?: boolean
          name_norm?: string | null
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "ingredients_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
        ]
      }
      me_checkin_dismissals: {
        Row: {
          kind: string
          log_date: string
          user_id: string
        }
        Insert: {
          kind: string
          log_date: string
          user_id: string
        }
        Update: {
          kind?: string
          log_date?: string
          user_id?: string
        }
        Relationships: []
      }
      me_food_log: {
        Row: {
          calories: number
          carbs_g: number
          created_at: string
          fat_g: number
          fiber_g: number | null
          id: string
          log_date: string
          meal: string
          name: string
          nutrients: Json | null
          protein_g: number
          recipe_id: string | null
          servings: number | null
          sodium_mg: number | null
          source: string
          user_id: string
        }
        Insert: {
          calories: number
          carbs_g?: number
          created_at?: string
          fat_g?: number
          fiber_g?: number | null
          id?: string
          log_date: string
          meal: string
          name: string
          nutrients?: Json | null
          protein_g?: number
          recipe_id?: string | null
          servings?: number | null
          sodium_mg?: number | null
          source?: string
          user_id: string
        }
        Update: {
          calories?: number
          carbs_g?: number
          created_at?: string
          fat_g?: number
          fiber_g?: number | null
          id?: string
          log_date?: string
          meal?: string
          name?: string
          nutrients?: Json | null
          protein_g?: number
          recipe_id?: string | null
          servings?: number | null
          sodium_mg?: number | null
          source?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "me_food_log_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "nutrition_calorie_check"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "me_food_log_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      me_sleep: {
        Row: {
          hours: number
          log_date: string
          user_id: string
        }
        Insert: {
          hours: number
          log_date: string
          user_id: string
        }
        Update: {
          hours?: number
          log_date?: string
          user_id?: string
        }
        Relationships: []
      }
      me_targets: {
        Row: {
          activity: number
          age_years: number
          carbs_g: number
          fat_g: number
          goal: string
          goal_weight_kg: number | null
          height_cm: number
          kcal: number
          pace_kg: number
          protein_g: number
          sex: string
          units: string
          updated_at: string
          user_id: string
          weight_kg: number
        }
        Insert: {
          activity: number
          age_years: number
          carbs_g: number
          fat_g: number
          goal: string
          goal_weight_kg?: number | null
          height_cm: number
          kcal: number
          pace_kg?: number
          protein_g: number
          sex: string
          units?: string
          updated_at?: string
          user_id: string
          weight_kg: number
        }
        Update: {
          activity?: number
          age_years?: number
          carbs_g?: number
          fat_g?: number
          goal?: string
          goal_weight_kg?: number | null
          height_cm?: number
          kcal?: number
          pace_kg?: number
          protein_g?: number
          sex?: string
          units?: string
          updated_at?: string
          user_id?: string
          weight_kg?: number
        }
        Relationships: []
      }
      me_weights: {
        Row: {
          log_date: string
          user_id: string
          weight_kg: number
        }
        Insert: {
          log_date: string
          user_id: string
          weight_kg: number
        }
        Update: {
          log_date?: string
          user_id?: string
          weight_kg?: number
        }
        Relationships: []
      }
      me_workout_muscles: {
        Row: {
          muscle: string
          sets: number
          user_id: string
          workout_id: string
        }
        Insert: {
          muscle: string
          sets: number
          user_id: string
          workout_id: string
        }
        Update: {
          muscle?: string
          sets?: number
          user_id?: string
          workout_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "me_workout_muscles_workout_id_user_id_fkey"
            columns: ["workout_id", "user_id"]
            isOneToOne: false
            referencedRelation: "me_workouts"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      me_workouts: {
        Row: {
          created_at: string
          custom_name: string | null
          id: string
          log_date: string
          minutes: number | null
          session: string
          sets: number
          user_id: string
        }
        Insert: {
          created_at?: string
          custom_name?: string | null
          id?: string
          log_date: string
          minutes?: number | null
          session: string
          sets: number
          user_id: string
        }
        Update: {
          created_at?: string
          custom_name?: string | null
          id?: string
          log_date?: string
          minutes?: number | null
          session?: string
          sets?: number
          user_id?: string
        }
        Relationships: []
      }
      nutrient_conversions: {
        Row: {
          factor: number
          from_nutrient_id: number
          note: string | null
          priority: number
          to_nutrient_id: number
        }
        Insert: {
          factor: number
          from_nutrient_id: number
          note?: string | null
          priority?: number
          to_nutrient_id: number
        }
        Update: {
          factor?: number
          from_nutrient_id?: number
          note?: string | null
          priority?: number
          to_nutrient_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "nutrient_conversions_from_nutrient_id_fkey"
            columns: ["from_nutrient_id"]
            isOneToOne: false
            referencedRelation: "nutrients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nutrient_conversions_to_nutrient_id_fkey"
            columns: ["to_nutrient_id"]
            isOneToOne: false
            referencedRelation: "nutrients"
            referencedColumns: ["id"]
          },
        ]
      }
      nutrient_dris: {
        Row: {
          age_max: number
          age_min: number
          amount: number
          kind: string
          nutrient_key: string
          sex: string
        }
        Insert: {
          age_max: number
          age_min: number
          amount: number
          kind: string
          nutrient_key: string
          sex: string
        }
        Update: {
          age_max?: number
          age_min?: number
          amount?: number
          kind?: string
          nutrient_key?: string
          sex?: string
        }
        Relationships: [
          {
            foreignKeyName: "nutrient_dris_nutrient_key_fkey"
            columns: ["nutrient_key"]
            isOneToOne: false
            referencedRelation: "nutrients"
            referencedColumns: ["key"]
          },
        ]
      }
      nutrients: {
        Row: {
          display_group: string
          dv_amount: number | null
          dv_unit: string | null
          fdc_number: string | null
          fdc_nutrient_id: number | null
          id: number
          is_estimated: boolean
          key: string
          name: string
          sort: number
          unit: string
        }
        Insert: {
          display_group: string
          dv_amount?: number | null
          dv_unit?: string | null
          fdc_number?: string | null
          fdc_nutrient_id?: number | null
          id: number
          is_estimated?: boolean
          key: string
          name: string
          sort: number
          unit: string
        }
        Update: {
          display_group?: string
          dv_amount?: number | null
          dv_unit?: string | null
          fdc_number?: string | null
          fdc_nutrient_id?: number | null
          id?: number
          is_estimated?: boolean
          key?: string
          name?: string
          sort?: number
          unit?: string
        }
        Relationships: []
      }
      prep_rules: {
        Row: {
          enabled: boolean
          factor: number | null
          form: string | null
          id: number
          ingredient_id: number | null
          kind: string
          note: string | null
          pattern: string
          priority: number
          satisfied_by: string | null
          strict: boolean
        }
        Insert: {
          enabled?: boolean
          factor?: number | null
          form?: string | null
          id?: never
          ingredient_id?: number | null
          kind: string
          note?: string | null
          pattern: string
          priority?: number
          satisfied_by?: string | null
          strict?: boolean
        }
        Update: {
          enabled?: boolean
          factor?: number | null
          form?: string | null
          id?: never
          ingredient_id?: number | null
          kind?: string
          note?: string | null
          pattern?: string
          priority?: number
          satisfied_by?: string | null
          strict?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "prep_rules_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          username: string | null
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
          username?: string | null
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          username?: string | null
        }
        Relationships: []
      }
      recipe_allergens: {
        Row: {
          allergen_id: number
          basis: string
          recipe_id: string
        }
        Insert: {
          allergen_id: number
          basis?: string
          recipe_id: string
        }
        Update: {
          allergen_id?: number
          basis?: string
          recipe_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_allergens_allergen_id_fkey"
            columns: ["allergen_id"]
            isOneToOne: false
            referencedRelation: "allergens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_allergens_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "nutrition_calorie_check"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_allergens_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_cookware: {
        Row: {
          alt_group: number | null
          cookware_id: number
          recipe_id: string
        }
        Insert: {
          alt_group?: number | null
          cookware_id: number
          recipe_id: string
        }
        Update: {
          alt_group?: number | null
          cookware_id?: number
          recipe_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_cookware_cookware_id_fkey"
            columns: ["cookware_id"]
            isOneToOne: false
            referencedRelation: "cookware"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_cookware_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "nutrition_calorie_check"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_cookware_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_diet_exceptions: {
        Row: {
          action: string
          diet_id: number
          reason: string
          recipe_id: string
        }
        Insert: {
          action: string
          diet_id: number
          reason: string
          recipe_id: string
        }
        Update: {
          action?: string
          diet_id?: number
          reason?: string
          recipe_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_diet_exceptions_diet_id_fkey"
            columns: ["diet_id"]
            isOneToOne: false
            referencedRelation: "diets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_diet_exceptions_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "nutrition_calorie_check"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_diet_exceptions_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_diets: {
        Row: {
          diet_id: number
          recipe_id: string
        }
        Insert: {
          diet_id: number
          recipe_id: string
        }
        Update: {
          diet_id?: number
          recipe_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_diets_diet_id_fkey"
            columns: ["diet_id"]
            isOneToOne: false
            referencedRelation: "diets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_diets_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "nutrition_calorie_check"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_diets_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_ingredients: {
        Row: {
          fdc_id: number | null
          id: number
          ingredient_id: number
          is_optional: boolean
          prep_note: string | null
          quantity: number | null
          recipe_id: string
          sort_order: number
          unit_id: number | null
        }
        Insert: {
          fdc_id?: number | null
          id?: never
          ingredient_id: number
          is_optional?: boolean
          prep_note?: string | null
          quantity?: number | null
          recipe_id: string
          sort_order: number
          unit_id?: number | null
        }
        Update: {
          fdc_id?: number | null
          id?: never
          ingredient_id?: number
          is_optional?: boolean
          prep_note?: string | null
          quantity?: number | null
          recipe_id?: string
          sort_order?: number
          unit_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "recipe_ingredients_fdc_id_fkey"
            columns: ["fdc_id"]
            isOneToOne: false
            referencedRelation: "usda_foods"
            referencedColumns: ["fdc_id"]
          },
          {
            foreignKeyName: "recipe_ingredients_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_ingredients_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "nutrition_calorie_check"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_ingredients_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_ingredients_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_nutrients: {
        Row: {
          amount_per_serving: number
          computed_at: string
          coverage: number
          nutrient_id: number
          recipe_id: string
        }
        Insert: {
          amount_per_serving: number
          computed_at?: string
          coverage: number
          nutrient_id: number
          recipe_id: string
        }
        Update: {
          amount_per_serving?: number
          computed_at?: string
          coverage?: number
          nutrient_id?: number
          recipe_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_nutrients_nutrient_id_fkey"
            columns: ["nutrient_id"]
            isOneToOne: false
            referencedRelation: "nutrients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_nutrients_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "nutrition_calorie_check"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_nutrients_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_optional_allergens: {
        Row: {
          allergen_id: number
          basis: string
          recipe_id: string
        }
        Insert: {
          allergen_id: number
          basis?: string
          recipe_id: string
        }
        Update: {
          allergen_id?: number
          basis?: string
          recipe_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipe_optional_allergens_allergen_id_fkey"
            columns: ["allergen_id"]
            isOneToOne: false
            referencedRelation: "allergens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_optional_allergens_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "nutrition_calorie_check"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_optional_allergens_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_photos: {
        Row: {
          alt_text: string | null
          attribution_url: string
          created_at: string
          credit: string | null
          height: number
          license: string
          license_url: string | null
          recipe_id: string
          source: string
          source_image_url: string | null
          storage_path: string
          thumb_path: string | null
          width: number
        }
        Insert: {
          alt_text?: string | null
          attribution_url: string
          created_at?: string
          credit?: string | null
          height: number
          license: string
          license_url?: string | null
          recipe_id: string
          source: string
          source_image_url?: string | null
          storage_path: string
          thumb_path?: string | null
          width: number
        }
        Update: {
          alt_text?: string | null
          attribution_url?: string
          created_at?: string
          credit?: string | null
          height?: number
          license?: string
          license_url?: string | null
          recipe_id?: string
          source?: string
          source_image_url?: string | null
          storage_path?: string
          thumb_path?: string | null
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: "recipe_photos_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: true
            referencedRelation: "nutrition_calorie_check"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_photos_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: true
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_reviews: {
        Row: {
          prior_status: Database["public"]["Enums"]["recipe_status"] | null
          recipe_id: string
          review_note: string | null
          review_status: Database["public"]["Enums"]["review_status"]
          reviewed_at: string
          reviewed_by: string | null
        }
        Insert: {
          prior_status?: Database["public"]["Enums"]["recipe_status"] | null
          recipe_id: string
          review_note?: string | null
          review_status: Database["public"]["Enums"]["review_status"]
          reviewed_at?: string
          reviewed_by?: string | null
        }
        Update: {
          prior_status?: Database["public"]["Enums"]["recipe_status"] | null
          recipe_id?: string
          review_note?: string | null
          review_status?: Database["public"]["Enums"]["review_status"]
          reviewed_at?: string
          reviewed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recipe_reviews_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: true
            referencedRelation: "nutrition_calorie_check"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_reviews_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: true
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_reviews_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_steps: {
        Row: {
          id: number
          instruction: string
          recipe_id: string
          sort_order: number
        }
        Insert: {
          id?: never
          instruction: string
          recipe_id: string
          sort_order: number
        }
        Update: {
          id?: never
          instruction?: string
          recipe_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "recipe_steps_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "nutrition_calorie_check"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_steps_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipes: {
        Row: {
          author_id: string | null
          calories: number | null
          carbs_g: number | null
          cook_time_min: number | null
          cost_per_serving: number | null
          created_at: string
          cuisine_id: number | null
          description: string | null
          fat_g: number | null
          fiber_g: number | null
          has_photo: boolean
          id: string
          image_url: string | null
          notes: string | null
          nutrition_assumptions: string[]
          nutrition_gaps: string[] | null
          nutrition_kcal_delta: number | null
          nutrition_source: string | null
          nutrition_status: string | null
          prep_time_min: number | null
          protein_g: number | null
          published_at: string | null
          search_vector: unknown
          servings: number
          slug: string
          sodium_mg: number | null
          source_license: string | null
          source_name: string | null
          source_url: string | null
          spice_level: number | null
          status: Database["public"]["Enums"]["recipe_status"]
          title: string
          total_time_min: number | null
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          calories?: number | null
          carbs_g?: number | null
          cook_time_min?: number | null
          cost_per_serving?: number | null
          created_at?: string
          cuisine_id?: number | null
          description?: string | null
          fat_g?: number | null
          fiber_g?: number | null
          has_photo?: boolean
          id?: string
          image_url?: string | null
          notes?: string | null
          nutrition_assumptions?: string[]
          nutrition_gaps?: string[] | null
          nutrition_kcal_delta?: number | null
          nutrition_source?: string | null
          nutrition_status?: string | null
          prep_time_min?: number | null
          protein_g?: number | null
          published_at?: string | null
          search_vector?: unknown
          servings: number
          slug: string
          sodium_mg?: number | null
          source_license?: string | null
          source_name?: string | null
          source_url?: string | null
          spice_level?: number | null
          status?: Database["public"]["Enums"]["recipe_status"]
          title: string
          total_time_min?: number | null
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          calories?: number | null
          carbs_g?: number | null
          cook_time_min?: number | null
          cost_per_serving?: number | null
          created_at?: string
          cuisine_id?: number | null
          description?: string | null
          fat_g?: number | null
          fiber_g?: number | null
          has_photo?: boolean
          id?: string
          image_url?: string | null
          notes?: string | null
          nutrition_assumptions?: string[]
          nutrition_gaps?: string[] | null
          nutrition_kcal_delta?: number | null
          nutrition_source?: string | null
          nutrition_status?: string | null
          prep_time_min?: number | null
          protein_g?: number | null
          published_at?: string | null
          search_vector?: unknown
          servings?: number
          slug?: string
          sodium_mg?: number | null
          source_license?: string | null
          source_name?: string | null
          source_url?: string | null
          spice_level?: number | null
          status?: Database["public"]["Enums"]["recipe_status"]
          title?: string
          total_time_min?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipes_cuisine_id_fkey"
            columns: ["cuisine_id"]
            isOneToOne: false
            referencedRelation: "cuisines"
            referencedColumns: ["id"]
          },
        ]
      }
      shelf_life_defaults: {
        Row: {
          aisle_category: string
          days: number
          note: string | null
        }
        Insert: {
          aisle_category: string
          days: number
          note?: string | null
        }
        Update: {
          aisle_category?: string
          days?: number
          note?: string | null
        }
        Relationships: []
      }
      shopping_list_items: {
        Row: {
          checked: boolean
          created_at: string
          id: number
          ingredient_id: number
          quantity: number | null
          source_recipe_id: string | null
          unit_id: number | null
          user_id: string
        }
        Insert: {
          checked?: boolean
          created_at?: string
          id?: never
          ingredient_id: number
          quantity?: number | null
          source_recipe_id?: string | null
          unit_id?: number | null
          user_id: string
        }
        Update: {
          checked?: boolean
          created_at?: string
          id?: never
          ingredient_id?: number
          quantity?: number | null
          source_recipe_id?: string | null
          unit_id?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shopping_list_items_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_list_items_source_recipe_id_fkey"
            columns: ["source_recipe_id"]
            isOneToOne: false
            referencedRelation: "nutrition_calorie_check"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_list_items_source_recipe_id_fkey"
            columns: ["source_recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_list_items_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_list_items_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      to_taste_ingredients: {
        Row: {
          ingredient_id: number
          note: string | null
        }
        Insert: {
          ingredient_id: number
          note?: string | null
        }
        Update: {
          ingredient_id?: number
          note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "to_taste_ingredients_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: true
            referencedRelation: "ingredients"
            referencedColumns: ["id"]
          },
        ]
      }
      unit_aliases: {
        Row: {
          alias: string
          id: number
          unit_id: number
        }
        Insert: {
          alias: string
          id?: never
          unit_id: number
        }
        Update: {
          alias?: string
          id?: never
          unit_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "unit_aliases_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      units: {
        Row: {
          id: number
          kind: Database["public"]["Enums"]["unit_kind"]
          name: string
          to_base_factor: number | null
        }
        Insert: {
          id?: never
          kind: Database["public"]["Enums"]["unit_kind"]
          name: string
          to_base_factor?: number | null
        }
        Update: {
          id?: never
          kind?: Database["public"]["Enums"]["unit_kind"]
          name?: string
          to_base_factor?: number | null
        }
        Relationships: []
      }
      usda_food_nutrients: {
        Row: {
          amount_per_100g: number
          fdc_id: number
          nutrient_id: number
        }
        Insert: {
          amount_per_100g: number
          fdc_id: number
          nutrient_id: number
        }
        Update: {
          amount_per_100g?: number
          fdc_id?: number
          nutrient_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "usda_food_nutrients_fdc_id_fkey"
            columns: ["fdc_id"]
            isOneToOne: false
            referencedRelation: "usda_foods"
            referencedColumns: ["fdc_id"]
          },
          {
            foreignKeyName: "usda_food_nutrients_nutrient_id_fkey"
            columns: ["nutrient_id"]
            isOneToOne: false
            referencedRelation: "nutrients"
            referencedColumns: ["id"]
          },
        ]
      }
      usda_foods: {
        Row: {
          brand_name: string | null
          brand_owner: string | null
          cached_at: string
          data_type: string
          description: string
          fdc_id: number
          household_serving: string | null
          publication_date: string | null
          serving_size: number | null
          serving_size_unit: string | null
          source_code: string | null
        }
        Insert: {
          brand_name?: string | null
          brand_owner?: string | null
          cached_at?: string
          data_type: string
          description: string
          fdc_id: number
          household_serving?: string | null
          publication_date?: string | null
          serving_size?: number | null
          serving_size_unit?: string | null
          source_code?: string | null
        }
        Update: {
          brand_name?: string | null
          brand_owner?: string | null
          cached_at?: string
          data_type?: string
          description?: string
          fdc_id?: number
          household_serving?: string | null
          publication_date?: string | null
          serving_size?: number | null
          serving_size_unit?: string | null
          source_code?: string | null
        }
        Relationships: []
      }
      user_cookware: {
        Row: {
          cookware_id: number
          created_at: string
          user_id: string
        }
        Insert: {
          cookware_id: number
          created_at?: string
          user_id: string
        }
        Update: {
          cookware_id?: number
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_cookware_cookware_id_fkey"
            columns: ["cookware_id"]
            isOneToOne: false
            referencedRelation: "cookware"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_cookware_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_settings: {
        Row: {
          allergen_slugs: string[]
          diet_slugs: string[]
          sex: string | null
          units: string
          updated_at: string
          user_id: string
          week_start: string
        }
        Insert: {
          allergen_slugs?: string[]
          diet_slugs?: string[]
          sex?: string | null
          units?: string
          updated_at?: string
          user_id: string
          week_start?: string
        }
        Update: {
          allergen_slugs?: string[]
          diet_slugs?: string[]
          sex?: string | null
          units?: string
          updated_at?: string
          user_id?: string
          week_start?: string
        }
        Relationships: []
      }
    }
    Views: {
      nutrition_calorie_check: {
        Row: {
          computed_kcal: number | null
          id: string | null
          pct_diff: number | null
          published_kcal: number | null
          slug: string | null
          title: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      add_missing_to_shopping_list: {
        Args: { p_ingredient_ids: number[]; p_recipe_id: string }
        Returns: Json
      }
      add_recipe_to_shopping_list: {
        Args: {
          p_add_batch?: boolean
          p_have_ids?: number[]
          p_recipe_id: string
          p_servings: number
          p_skip_staples?: boolean
        }
        Returns: Json
      }
      admin_assert: { Args: never; Returns: undefined }
      admin_in_scope: {
        Args: { r: Database["public"]["Tables"]["recipes"]["Row"] }
        Returns: boolean
      }
      admin_recipe_detail: { Args: { p_slug: string }; Returns: Json }
      admin_review_list: {
        Args: {
          p_after?: string
          p_limit?: number
          p_source?: string
          p_state?: string
        }
        Returns: {
          ingredient_count: number
          reviewed_at: string
          slug: string
          source_key: string
          state: string
          status: Database["public"]["Enums"]["recipe_status"]
          title: string
        }[]
      }
      admin_review_neighbors: {
        Args: { p_slug: string; p_source?: string; p_state?: string }
        Returns: {
          next_slug: string
          prev_slug: string
          total: number
        }[]
      }
      admin_review_progress: {
        Args: never
        Returns: {
          n: number
          source_key: string
          state: string
        }[]
      }
      admin_set_review: {
        Args: { p_note?: string; p_slugs: string[]; p_state: string }
        Returns: number
      }
      admin_update_recipe: {
        Args: {
          p_ingredients?: Json
          p_slug: string
          p_steps?: Json
          p_title?: string
        }
        Returns: undefined
      }
      can_read_recipe: { Args: { p_recipe_id: string }; Returns: boolean }
      compute_nutrients: {
        Args: { lines: Json; servings: number }
        Returns: {
          amount_per_serving: number
          coverage: number
          nutrient_id: number
          nutrient_key: string
        }[]
      }
      compute_recipe_search_vector: {
        Args: { p_cuisine_id: number; p_recipe_id: string; p_title: string }
        Returns: unknown
      }
      delete_my_account: { Args: never; Returns: undefined }
      delete_my_recipe: { Args: { p_recipe_id: string }; Returns: string }
      diet_satisfying: { Args: { diet_slug: string }; Returns: string[] }
      expand_ingredient_family: { Args: { ids: number[] }; Returns: number[] }
      feature_enabled: { Args: { p_name: string }; Returns: boolean }
      filtered_recipes: {
        Args: {
          diet_slugs?: string[]
          exclude_slugs?: string[]
          include_ids?: number[]
          owned?: string[]
        }
        Returns: {
          author_id: string | null
          calories: number | null
          carbs_g: number | null
          cook_time_min: number | null
          cost_per_serving: number | null
          created_at: string
          cuisine_id: number | null
          description: string | null
          fat_g: number | null
          fiber_g: number | null
          has_photo: boolean
          id: string
          image_url: string | null
          notes: string | null
          nutrition_assumptions: string[]
          nutrition_gaps: string[] | null
          nutrition_kcal_delta: number | null
          nutrition_source: string | null
          nutrition_status: string | null
          prep_time_min: number | null
          protein_g: number | null
          published_at: string | null
          search_vector: unknown
          servings: number
          slug: string
          sodium_mg: number | null
          source_license: string | null
          source_name: string | null
          source_url: string | null
          spice_level: number | null
          status: Database["public"]["Enums"]["recipe_status"]
          title: string
          total_time_min: number | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "recipes"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      food_has_nutrition: { Args: { p_fdc: number }; Returns: boolean }
      food_nutrient_amount: {
        Args: { p_fdc: number; p_ingredient: number; p_nutrient: number }
        Returns: number
      }
      fridge_recipes_grouped: {
        Args: {
          cookware_slugs?: string[]
          cuisine_slugs?: string[]
          cursor_coverage?: number
          cursor_have?: number
          cursor_recipe_id?: string
          cursor_soon?: number
          cursor_time_key?: number
          diet_slugs?: string[]
          exclude_allergen_slugs?: string[]
          group_filter?: string
          include_ingredient_ids?: number[]
          max_calories?: number
          max_spice?: number
          max_total_min?: number
          min_calories?: number
          min_protein_g?: number
          min_total_min?: number
          owned_cookware_slugs?: string[]
          page_size?: number
          pantry_ids: number[]
          per_group?: number
          soon_days?: number[]
          soon_ids?: number[]
        }
        Returns: {
          calories: number
          coverage: number
          group_total: number
          grp: string
          have_count: number
          image_url: string
          missing_count: number
          missing_ids: number[]
          missing_names: string[]
          needed_count: number
          recipe_id: string
          servings: number
          slug: string
          soon_day: number
          soon_key: number
          time_key: number
          title: string
          total_time_min: number
        }[]
      }
      import_local_shopping_list: { Args: { p_items: Json }; Returns: number }
      ingredient_coverage: {
        Args: { min_similarity?: number; raw_names: string[] }
        Returns: {
          canonical_name: string
          confidence: number
          ingredient_id: number
          match_kind: Database["public"]["Enums"]["ingredient_match_kind"]
          raw_name: string
        }[]
      }
      is_admin: { Args: never; Returns: boolean }
      line_is_optional: {
        Args: { p_is_optional: boolean; p_prep_note: string }
        Returns: boolean
      }
      makeable_recipes: {
        Args: { owned: string[] }
        Returns: {
          author_id: string | null
          calories: number | null
          carbs_g: number | null
          cook_time_min: number | null
          cost_per_serving: number | null
          created_at: string
          cuisine_id: number | null
          description: string | null
          fat_g: number | null
          fiber_g: number | null
          has_photo: boolean
          id: string
          image_url: string | null
          notes: string | null
          nutrition_assumptions: string[]
          nutrition_gaps: string[] | null
          nutrition_kcal_delta: number | null
          nutrition_source: string | null
          nutrition_status: string | null
          prep_time_min: number | null
          protein_g: number | null
          published_at: string | null
          search_vector: unknown
          servings: number
          slug: string
          sodium_mg: number | null
          source_license: string | null
          source_name: string | null
          source_url: string | null
          spice_level: number | null
          status: Database["public"]["Enums"]["recipe_status"]
          title: string
          total_time_min: number | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "recipes"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      match_recipes: {
        Args: {
          cookware_slugs?: string[]
          cuisine_slugs?: string[]
          cursor_coverage?: number
          cursor_have?: number
          cursor_recipe_id?: string
          cursor_time_key?: number
          diet_slugs?: string[]
          exclude_allergen_slugs?: string[]
          include_ingredient_ids?: number[]
          max_calories?: number
          max_missing?: number
          max_spice?: number
          max_total_min?: number
          min_calories?: number
          min_have?: number
          min_protein_g?: number
          min_total_min?: number
          must_use_ids?: number[]
          owned_cookware_slugs?: string[]
          page_size?: number
          pantry_ids: number[]
        }
        Returns: {
          calories: number
          coverage: number
          have_count: number
          image_url: string
          missing_count: number
          missing_ids: number[]
          missing_names: string[]
          needed_count: number
          recipe_id: string
          servings: number
          slug: string
          time_key: number
          title: string
          total_time_min: number
        }[]
      }
      me_log_workout: {
        Args: {
          p_custom_name: string
          p_date: string
          p_minutes: number
          p_muscles: Json
          p_session: string
        }
        Returns: string
      }
      me_logged_days: {
        Args: { p_from: string; p_to: string }
        Returns: {
          kind: string
          log_date: string
        }[]
      }
      me_month_summary: {
        Args: { p_from: string; p_to: string }
        Returns: {
          calories: number
          food_entries: number
          log_date: string
          protein_g: number
          sets: number
          sleep_hours: number
          trained: string[]
          weight_kg: number
        }[]
      }
      me_week_muscles: {
        Args: { p_from: string; p_to: string }
        Returns: {
          days: string[]
          muscle: string
          sets: number
        }[]
      }
      my_recipe_foods: { Args: { p_recipe_id: string }; Returns: Json }
      my_recipe_for_edit: { Args: { p_recipe_id: string }; Returns: Json }
      my_recipes: {
        Args: never
        Returns: {
          cook_time_min: number
          id: string
          ingredient_count: number
          prep_time_min: number
          returned: boolean
          review_note: string
          servings: number
          slug: string
          status: Database["public"]["Enums"]["recipe_status"]
          title: string
          updated_at: string
        }[]
      }
      normalize_ingredient_name: { Args: { raw: string }; Returns: string }
      nutrition_assumptions: { Args: { lines: Json }; Returns: string[] }
      nutrition_line_grams: {
        Args: {
          p_form: string
          p_ingredient_id: number
          p_qty: number
          p_unit_id: number
        }
        Returns: {
          basis: string
          grams: number
        }[]
      }
      nutrition_line_report: {
        Args: { lines: Json }
        Returns: {
          basis: string
          fdc_id: number
          form: string
          grams: number
          ingredient: string
          ingredient_id: number
          note: string
          ord: number
          state: string
          unit_name: string
        }[]
      }
      nutrition_summary: {
        Args: { lines: Json }
        Returns: {
          counted_lines: number
          excluded_lines: string[]
          gaps: string[]
          optional_lines: string[]
          quantified_lines: number
          status: string
          to_taste: string[]
          total_grams: number
        }[]
      }
      owns_recipe: { Args: { p_recipe_id: string }; Returns: boolean }
      recipe_allergen_rows: {
        Args: { p_recipe?: string }
        Returns: {
          allergen_id: number
          basis: string
          optional_only: boolean
          recipe_id: string
        }[]
      }
      recipe_diet_rows: {
        Args: { p_recipe?: string }
        Returns: {
          diet_id: number
          recipe_id: string
        }[]
      }
      recipe_expiry_days: {
        Args: { item_days: number[]; item_ids: number[]; recipe_ids: string[] }
        Returns: {
          days: number
          items: number
          recipe_id: string
        }[]
      }
      recipe_has_allergen: {
        Args: { p_recipe_id: string; p_slugs: string[] }
        Returns: boolean
      }
      recipe_national_sources: {
        Args: { p_recipe_id: string }
        Returns: string[]
      }
      recipe_source_key: { Args: { p_source_name: string }; Returns: string }
      refresh_all_recipe_allergens: { Args: never; Returns: undefined }
      refresh_all_recipe_diets: { Args: never; Returns: undefined }
      refresh_all_recipe_nutrients: { Args: never; Returns: number }
      refresh_recipe_allergens: {
        Args: { p_recipe_id: string }
        Returns: undefined
      }
      refresh_recipe_diets: {
        Args: { p_recipe_id: string }
        Returns: undefined
      }
      refresh_recipe_nutrients: {
        Args: { p_recipe_id: string }
        Returns: string
      }
      resolve_ingredient: {
        Args: { min_similarity?: number; raw_name: string }
        Returns: {
          canonical_name: string
          confidence: number
          ingredient_id: number
          match_kind: Database["public"]["Enums"]["ingredient_match_kind"]
        }[]
      }
      resolve_unit: {
        Args: { raw_unit: string }
        Returns: {
          kind: Database["public"]["Enums"]["unit_kind"]
          unit_id: number
          unit_name: string
        }[]
      }
      save_my_recipe: {
        Args: { p_data: Json; p_recipe_id: string; p_submit?: boolean }
        Returns: Json
      }
      search_fold: { Args: { raw: string }; Returns: string }
      search_foods: {
        Args: { max_results?: number; q: string }
        Returns: {
          brand: string
          data_type: string
          fdc_id: number
          form: string
          has_nutrition: boolean
          household_serving: string
          ingredient_id: number
          ingredient_name: string
          is_default: boolean
          kind: string
          label: string
          score: number
          serving_size: number
          serving_size_unit: string
        }[]
      }
      search_recipes: {
        Args: {
          cookware_slugs?: string[]
          cuisine_slugs?: string[]
          cursor_id?: string
          cursor_score?: number
          diet_slugs?: string[]
          exclude_allergen_slugs?: string[]
          include_ingredient_ids?: number[]
          max_calories?: number
          max_carbs_g?: number
          max_fat_g?: number
          max_prep_min?: number
          max_protein_g?: number
          max_spice?: number
          max_total_min?: number
          min_calories?: number
          min_carbs_g?: number
          min_fat_g?: number
          min_protein_g?: number
          min_total_min?: number
          owned_cookware_slugs?: string[]
          q: string
          result_limit?: number
        }
        Returns: {
          calories: number
          id: string
          image_url: string
          match_kind: string
          score: number
          servings: number
          slug: string
          title: string
          total_time_min: number
        }[]
      }
      search_tsquery: { Args: { q: string }; Returns: unknown }
      set_my_recipe_foods: {
        Args: { p_picks: Json; p_recipe_id: string }
        Returns: undefined
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      singularize_ingredient_name: { Args: { raw: string }; Returns: string }
      strip_ingredient_modifiers: { Args: { raw: string }; Returns: string }
      suggest_ingredients: {
        Args: { max_results?: number; prefix: string }
        Returns: {
          canonical_name: string
          ingredient_id: number
          match_kind: string
          matched_text: string
          score: number
        }[]
      }
      suggested_shelf_life: {
        Args: { ingredient_ids: number[] }
        Returns: {
          days: number
          ingredient_id: number
        }[]
      }
      user_recipe_num: {
        Args: {
          p_field: string
          p_max: number
          p_min: number
          p_value: Json
          p_whole?: boolean
        }
        Returns: number
      }
      user_recipe_text: {
        Args: {
          p_field: string
          p_max: number
          p_min: number
          p_multiline?: boolean
          p_value: string
        }
        Returns: string
      }
      withdraw_my_recipe: { Args: { p_recipe_id: string }; Returns: string }
    }
    Enums: {
      ingredient_match_kind: "exact" | "alias" | "fuzzy"
      recipe_status: "draft" | "in_review" | "published"
      review_status: "approved" | "rejected"
      unit_kind: "mass" | "volume" | "count"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      ingredient_match_kind: ["exact", "alias", "fuzzy"],
      recipe_status: ["draft", "in_review", "published"],
      review_status: ["approved", "rejected"],
      unit_kind: ["mass", "volume", "count"],
    },
  },
} as const

