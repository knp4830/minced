export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
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
      ingredient_aliases: {
        Row: {
          alias: string
          id: number
          ingredient_id: number
        }
        Insert: {
          alias: string
          id?: never
          ingredient_id: number
        }
        Update: {
          alias?: string
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
          ingredient_id: number
        }
        Insert: {
          allergen_id: number
          ingredient_id: number
        }
        Update: {
          allergen_id?: number
          ingredient_id?: number
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
      ingredients: {
        Row: {
          aisle_category: string
          canonical_name: string
          created_at: string
          density_g_per_ml: number | null
          fdc_id: number | null
          id: number
          is_pantry_staple: boolean
          slug: string
        }
        Insert: {
          aisle_category: string
          canonical_name: string
          created_at?: string
          density_g_per_ml?: number | null
          fdc_id?: number | null
          id?: never
          is_pantry_staple?: boolean
          slug: string
        }
        Update: {
          aisle_category?: string
          canonical_name?: string
          created_at?: string
          density_g_per_ml?: number | null
          fdc_id?: number | null
          id?: never
          is_pantry_staple?: boolean
          slug?: string
        }
        Relationships: []
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
          recipe_id: string
        }
        Insert: {
          allergen_id: number
          recipe_id: string
        }
        Update: {
          allergen_id?: number
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
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_cookware: {
        Row: {
          cookware_id: number
          recipe_id: string
        }
        Insert: {
          cookware_id: number
          recipe_id: string
        }
        Update: {
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
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_ingredients: {
        Row: {
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
          id: string
          image_url: string | null
          notes: string | null
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
          id?: string
          image_url?: string | null
          notes?: string | null
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
          id?: string
          image_url?: string | null
          notes?: string | null
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_read_recipe: { Args: { p_recipe_id: string }; Returns: boolean }
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
      normalize_ingredient_name: { Args: { raw: string }; Returns: string }
      owns_recipe: { Args: { p_recipe_id: string }; Returns: boolean }
      refresh_recipe_allergens: {
        Args: { p_recipe_id: string }
        Returns: undefined
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
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      singularize_ingredient_name: { Args: { raw: string }; Returns: string }
      strip_ingredient_modifiers: { Args: { raw: string }; Returns: string }
    }
    Enums: {
      ingredient_match_kind: "exact" | "alias" | "fuzzy"
      recipe_status: "draft" | "in_review" | "published"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      ingredient_match_kind: ["exact", "alias", "fuzzy"],
      recipe_status: ["draft", "in_review", "published"],
      unit_kind: ["mass", "volume", "count"],
    },
  },
} as const
