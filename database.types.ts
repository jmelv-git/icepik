export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          created_at: string;
          id: string;
          post_limit_count: number;
          post_limit_hour: string | null;
          preferred_language: string;
          sightings_posted: number;
          votes_cast: number;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id: string;
          post_limit_count?: number;
          post_limit_hour?: string | null;
          preferred_language?: string;
          sightings_posted?: number;
          votes_cast?: number;
        };
        Update: {
          created_at?: string;
          id?: string;
          post_limit_count?: number;
          post_limit_hour?: string | null;
          preferred_language?: string;
          sightings_posted?: number;
          votes_cast?: number;
        };
        Relationships: [];
      };
      sighting_reporters: {
        Row: {
          reporter_id: string;
          sighting_id: string;
        };
        ComputedFields: never;
        Insert: {
          reporter_id: string;
          sighting_id: string;
        };
        Update: {
          reporter_id?: string;
          sighting_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sighting_reporters_reporter_id_fkey";
            columns: ["reporter_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sighting_reporters_sighting_id_fkey";
            columns: ["sighting_id"];
            isOneToOne: true;
            referencedRelation: "sightings";
            referencedColumns: ["id"];
          },
        ];
      };
      sighting_votes: {
        Row: {
          created_at: string;
          sighting_id: string;
          vote: Database["public"]["Enums"]["vote_type"];
          voter_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          sighting_id: string;
          vote: Database["public"]["Enums"]["vote_type"];
          voter_id: string;
        };
        Update: {
          created_at?: string;
          sighting_id?: string;
          vote?: Database["public"]["Enums"]["vote_type"];
          voter_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sighting_votes_sighting_id_fkey";
            columns: ["sighting_id"];
            isOneToOne: false;
            referencedRelation: "sightings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sighting_votes_voter_id_fkey";
            columns: ["voter_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      sightings: {
        Row: {
          agent_count: number | null;
          category: Database["public"]["Enums"]["sighting_category"];
          confirm_count: number;
          created_at: string;
          description: string | null;
          dispute_count: number;
          expires_at: string;
          id: string;
          lat: number;
          lng: number;
          location_label: string | null;
          vehicle_count: number | null;
          verification_score: number | null;
          verification_status: string | null;
        };
        ComputedFields: never;
        Insert: {
          agent_count?: number | null;
          category?: Database["public"]["Enums"]["sighting_category"];
          confirm_count?: number;
          created_at?: string;
          description?: string | null;
          dispute_count?: number;
          expires_at?: string;
          id?: string;
          lat: number;
          lng: number;
          location_label?: string | null;
          vehicle_count?: number | null;
          verification_score?: never;
          verification_status?: never;
        };
        Update: {
          agent_count?: number | null;
          category?: Database["public"]["Enums"]["sighting_category"];
          confirm_count?: number;
          created_at?: string;
          description?: string | null;
          dispute_count?: number;
          expires_at?: string;
          id?: string;
          lat?: number;
          lng?: number;
          location_label?: string | null;
          vehicle_count?: number | null;
          verification_score?: never;
          verification_status?: never;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      delete_my_account: { Args: Record<PropertyKey, never>; Returns: undefined };
      delete_my_sighting: { Args: { target_sighting_id: string }; Returns: undefined };
      distance_m: {
        Args: { lat1: number; lat2: number; lng1: number; lng2: number };
        Returns: number;
      };
      purge_expired_links: { Args: Record<PropertyKey, never>; Returns: undefined };
      set_my_language: { Args: { new_language: string }; Returns: undefined };
      sightings_near: {
        Args: { pin_lat: number; pin_lng: number; radius_m?: number };
        Returns: {
          agent_count: number;
          category: Database["public"]["Enums"]["sighting_category"];
          confirm_count: number;
          created_at: string;
          description: string;
          dispute_count: number;
          distance_m: number;
          expires_at: string;
          id: string;
          lat: number;
          lng: number;
          location_label: string;
          vehicle_count: number;
          verification_score: number;
          verification_status: string;
        }[];
      };
      vote_on_sighting: {
        Args: {
          my_lat: number;
          my_lng: number;
          my_vote: Database["public"]["Enums"]["vote_type"];
          target_sighting_id: string;
        };
        Returns: {
          agent_count: number | null;
          category: Database["public"]["Enums"]["sighting_category"];
          confirm_count: number;
          created_at: string;
          description: string | null;
          dispute_count: number;
          expires_at: string;
          id: string;
          lat: number;
          lng: number;
          location_label: string | null;
          vehicle_count: number | null;
          verification_score: number | null;
          verification_status: string | null;
        };
        SetofOptions: {
          from: "*";
          to: "sightings";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
    };
    Enums: {
      sighting_category: "patrol" | "vehicle" | "checkpoint" | "raid" | "other";
      vote_type: "confirm" | "dispute";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      sighting_category: ["patrol", "vehicle", "checkpoint", "raid", "other"],
      vote_type: ["confirm", "dispute"],
    },
  },
} as const;
