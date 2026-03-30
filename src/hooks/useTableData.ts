import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  deleteRows,
  insertRow,
  selectRows,
  updateRows,
} from "@/lib/api-client";
import type { TableConfig } from "@/lib/tableConfig";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

export function useTableData(config: TableConfig) {
  const queryClient = useQueryClient();
  const { activeOrganizationId } = useAuth();
  const queryKey = ["table", config.tableName, activeOrganizationId];

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      return selectRows<Record<string, unknown>>({
        table: config.tableName,
        select: "*",
        orderBy: config.defaultSort?.key,
        ascending: config.defaultSort?.direction === "asc",
      });
    },
  });

  const insertMutation = useMutation({
    mutationFn: async (row: Record<string, unknown>) => {
      return insertRow(config.tableName, row);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success("Row added successfully");
    },
    onError: (error: Error) => {
      toast.error(`Failed to add: ${error.message}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: unknown;
      updates: Record<string, unknown>;
    }) => {
      return updateRows(
        config.tableName,
        updates,
        [{ column: config.primaryKey, op: "eq", value: String(id) }],
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success("Row updated successfully");
    },
    onError: (error: Error) => {
      toast.error(`Failed to update: ${error.message}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: unknown) => {
      await deleteRows(config.tableName, [
        { column: config.primaryKey, op: "eq", value: String(id) },
      ]);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success("Row deleted successfully");
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete: ${error.message}`);
    },
  });

  return {
    data: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    insert: insertMutation.mutateAsync,
    update: updateMutation.mutateAsync,
    remove: deleteMutation.mutateAsync,
    isInserting: insertMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}
