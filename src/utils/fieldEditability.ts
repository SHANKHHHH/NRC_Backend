/**
 * Utility to determine which fields are editable based on existing data
 * Fields with existing data become read-only to prevent accidental overwrites
 */

export interface FieldEditability {
  [key: string]: boolean; // true = editable, false = read-only
}

/**
 * Determine which fields are editable based on existing data
 * @param data - The existing data object
 * @param alwaysEditableFields - Fields that should always be editable (e.g., status, remarks)
 * @returns Object with field names as keys and boolean editability as values
 */
export function getFieldEditability(
  data: any,
  alwaysEditableFields: string[] = ['status', 'remarks', 'qcCheckSignBy', 'qcCheckAt']
): FieldEditability {
  const editability: FieldEditability = {};
  
  if (!data || typeof data !== 'object') {
    return editability;
  }
  
  // Check each field
  for (const [key, value] of Object.entries(data)) {
    // Skip internal/system fields
    if (['id', 'jobStepId', 'jobNrcJobNo', 'createdAt', 'updatedAt'].includes(key)) {
      continue;
    }
    
    // Always editable fields
    if (alwaysEditableFields.includes(key)) {
      editability[key] = true;
      continue;
    }
    
    // If field has data (not null/undefined/empty string), make it read-only
    // If field is empty, make it editable
    editability[key] = value === null || value === undefined || value === '';
  }
  
  return editability;
}

/**
 * Wrap response data with editability information
 * @param data - The data to wrap
 * @param alwaysEditableFields - Fields that should always be editable
 * @returns Object with data and editability info
 */
export function wrapWithEditability(
  data: any,
  alwaysEditableFields?: string[]
): { data: any; editableFields: FieldEditability } {
  return {
    data,
    editableFields: getFieldEditability(data, alwaysEditableFields)
  };
}

/**
 * Filter update data to only allow editing of editable fields
 * Prevents modification of read-only fields
 * @param existingData - Current data in database
 * @param updateData - Data user wants to update
 * @param alwaysEditableFields - Fields that should always be editable
 * @returns Filtered update data with only editable fields
 */
export function filterEditableFields(
  existingData: any,
  updateData: any,
  alwaysEditableFields: string[] = ['status', 'remarks', 'qcCheckSignBy', 'qcCheckAt']
): any {
  const filteredData: any = {};
  const editability = getFieldEditability(existingData, alwaysEditableFields);
  
  // Only include fields that are editable
  for (const [key, value] of Object.entries(updateData)) {
    // Allow if field is editable or not in editability check (new fields)
    if (editability[key] === true || editability[key] === undefined) {
      filteredData[key] = value;
    }
  }
  
  return filteredData;
}

