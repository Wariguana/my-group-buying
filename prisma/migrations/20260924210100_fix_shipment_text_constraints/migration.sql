-- PostgreSQL's default btrim removes spaces only. POSIX space plus the
-- additional ECMAScript trim characters match the application boundary.
-- Internal whitespace is deliberately allowed in tracking identifiers.
ALTER TABLE "Shipment"
  DROP CONSTRAINT "Shipment_trackingNumber_trimmed_check",
  DROP CONSTRAINT "Shipment_recipientName_nonblank_check",
  DROP CONSTRAINT "Shipment_recipientPhone_nonblank_check",
  DROP CONSTRAINT "Shipment_sevenElevenStoreId_nonblank_check",
  DROP CONSTRAINT "Shipment_sevenElevenStoreName_nonblank_check",
  DROP CONSTRAINT "Shipment_sevenElevenStoreAddress_nonblank_check";

ALTER TABLE "Shipment"
  ADD CONSTRAINT "Shipment_trackingNumber_trimmed_check" CHECK (
    char_length("trackingNumber") BETWEEN 1 AND 128
    AND "trackingNumber" ~ ('[^[:space:]' || U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF' || ']')
    AND left("trackingNumber", 1) !~ ('[[:space:]' || U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF' || ']')
    AND right("trackingNumber", 1) !~ ('[[:space:]' || U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF' || ']')
  ),
  ADD CONSTRAINT "Shipment_recipientName_nonblank_check" CHECK (
    "recipientName" ~ ('[^[:space:]' || U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF' || ']')
  ),
  ADD CONSTRAINT "Shipment_recipientPhone_nonblank_check" CHECK (
    "recipientPhone" ~ ('[^[:space:]' || U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF' || ']')
  ),
  ADD CONSTRAINT "Shipment_sevenElevenStoreId_nonblank_check" CHECK (
    "sevenElevenStoreId" ~ ('[^[:space:]' || U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF' || ']')
  ),
  ADD CONSTRAINT "Shipment_sevenElevenStoreName_nonblank_check" CHECK (
    "sevenElevenStoreName" ~ ('[^[:space:]' || U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF' || ']')
  ),
  ADD CONSTRAINT "Shipment_sevenElevenStoreAddress_nonblank_check" CHECK (
    "sevenElevenStoreAddress" ~ ('[^[:space:]' || U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF' || ']')
  );
