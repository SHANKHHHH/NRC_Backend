/**
 * Calculate the difference in days between the current date and a given date
 * @param date - The date to calculate difference from
 * @returns The difference in days (positive if date is in the past, negative if in the future)
 */
export const calculateDateDifference = (date: Date | null | undefined): number | null => {
    if (!date) return null;
    
    const currentDate = new Date();
    const targetDate = new Date(date);
    
    // Reset time to midnight for accurate day calculation
    currentDate.setHours(0, 0, 0, 0);
    targetDate.setHours(0, 0, 0, 0);
    
    const timeDifference = currentDate.getTime() - targetDate.getTime();
    const daysDifference = Math.ceil(timeDifference / (1000 * 60 * 60 * 24));
    
    return daysDifference;
  };
  
  /**
   * Calculate shared card diff date as the deadline date (180 days from shade card approval date)
   * @param shadeCardApprovalDate - The shade card approval date
   * @returns The deadline date as Unix timestamp (seconds since epoch), or null if no approval date
   */
  export const calculateSharedCardDiffDate = (shadeCardApprovalDate: Date | null | undefined): number | null => {
    if (!shadeCardApprovalDate) return null;
    
    const approvalDate = new Date(shadeCardApprovalDate);
    
    // Add 180 days to the approval date
    const deadlineDate = new Date(approvalDate);
    deadlineDate.setDate(deadlineDate.getDate() + 180);
    
    // Return as Unix timestamp in seconds (for storage as Int)
    return Math.floor(deadlineDate.getTime() / 1000);
  };