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
  public: {
    Tables: {
      assessments: {
        Row: {
          body_font: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          org_id: string
          slug: string
          theme_id: string | null
          title_font: string | null
          updated_at: string
        }
        Insert: {
          body_font?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          org_id: string
          slug: string
          theme_id?: string | null
          title_font?: string | null
          updated_at?: string
        }
        Update: {
          body_font?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          org_id?: string
          slug?: string
          theme_id?: string | null
          title_font?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessments_theme_id_fkey"
            columns: ["theme_id"]
            isOneToOne: false
            referencedRelation: "themes"
            referencedColumns: ["id"]
          },
        ]
      }
      invite_codes: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          expires_at: string
          org_id: string
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          expires_at?: string
          org_id: string
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string
          org_id?: string
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invite_codes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      org_members: {
        Row: {
          created_at: string
          id: string
          org_id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      orgs: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      responses: {
        Row: {
          created_at: string
          id: string
          response_type: string
          segment_id: string
          session_id: string
          sort_order: number
          storage_path: string | null
          text_value: Json | null
        }
        Insert: {
          created_at?: string
          id?: string
          response_type?: string
          segment_id: string
          session_id: string
          sort_order: number
          storage_path?: string | null
          text_value?: Json | null
        }
        Update: {
          created_at?: string
          id?: string
          response_type?: string
          segment_id?: string
          session_id?: string
          sort_order?: number
          storage_path?: string | null
          text_value?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "responses_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          rating: number | null
          response_id: string
          reviewer_user_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          rating?: number | null
          response_id: string
          reviewer_user_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          rating?: number | null
          response_id?: string
          reviewer_user_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_response_id_fkey"
            columns: ["response_id"]
            isOneToOne: false
            referencedRelation: "responses"
            referencedColumns: ["id"]
          },
        ]
      }
      segments: {
        Row: {
          assessment_id: string
          countdown_seconds: number | null
          created_at: string
          cue_color: string
          cue_label: string
          entry_fields: Json
          id: string
          is_active: boolean
          org_id: string
          override_card_color: string | null
          override_text_color: string | null
          prompt_audio_path: string | null
          script_text: string | null
          sort_order: number
          type: string
          updated_at: string
        }
        Insert: {
          assessment_id: string
          countdown_seconds?: number | null
          created_at?: string
          cue_color: string
          cue_label: string
          entry_fields?: Json
          id?: string
          is_active?: boolean
          org_id: string
          override_card_color?: string | null
          override_text_color?: string | null
          prompt_audio_path?: string | null
          script_text?: string | null
          sort_order: number
          type: string
          updated_at?: string
        }
        Update: {
          assessment_id?: string
          countdown_seconds?: number | null
          created_at?: string
          cue_color?: string
          cue_label?: string
          entry_fields?: Json
          id?: string
          is_active?: boolean
          org_id?: string
          override_card_color?: string | null
          override_text_color?: string | null
          prompt_audio_path?: string | null
          script_text?: string | null
          sort_order?: number
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "segments_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "segments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          archived_at: string | null
          assessment_id: string
          client_token: string
          created_at: string
          email: string | null
          id: string
          linkedin_url: string | null
          name: string | null
          org_id: string
          overall_rating: number | null
          read_at: string | null
          submitted_at: string | null
        }
        Insert: {
          archived_at?: string | null
          assessment_id: string
          client_token?: string
          created_at?: string
          email?: string | null
          id?: string
          linkedin_url?: string | null
          name?: string | null
          org_id: string
          overall_rating?: number | null
          read_at?: string | null
          submitted_at?: string | null
        }
        Update: {
          archived_at?: string | null
          assessment_id?: string
          client_token?: string
          created_at?: string
          email?: string | null
          id?: string
          linkedin_url?: string | null
          name?: string | null
          org_id?: string
          overall_rating?: number | null
          read_at?: string | null
          submitted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sessions_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      themes: {
        Row: {
          accent_color: string | null
          bg_color: string | null
          card_color: string | null
          created_at: string
          created_by: string | null
          id: string
          is_preset: boolean
          muted_color: string | null
          name: string
          text_color: string | null
          updated_at: string
        }
        Insert: {
          accent_color?: string | null
          bg_color?: string | null
          card_color?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_preset?: boolean
          muted_color?: string | null
          name: string
          text_color?: string | null
          updated_at?: string
        }
        Update: {
          accent_color?: string | null
          bg_color?: string | null
          card_color?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_preset?: boolean
          muted_color?: string | null
          name?: string
          text_color?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_session_token: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      session_matches_token: {
        Args: { _session_id: string; _token: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "superadmin"
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
      app_role: ["admin", "superadmin"],
    },
  },
} as const
